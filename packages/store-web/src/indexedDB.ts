import {
  Entity,
  EntityID,
  EntityType,
  Event,
  EventForEntity,
  EventID,
  IDOfEntity,
} from "@withorbit/core";
import {
  DatabaseBackend,
  DatabaseBackendEntityRecord,
  DatabaseEntityQuery,
  DatabaseEventQuery,
  DatabaseQueryPredicate,
  DatabaseQueryPredicateRelation,
} from "@withorbit/store-shared";
import Dexie, {
  Collection,
  IndexableType,
  PromiseExtended,
  WhereClause,
} from "dexie";
import { DexieDatabase } from "./dexie/dexie.js";
import {
  DexieDerivedTaskComponentKeys,
  DexieEntityKeys,
  DexieEntityRow,
  DexieEntityRowWithPrimaryKey,
  DexieEventKeys,
  DexieEventRow,
  DexieEventRowWithPrimaryKey,
  DexieTable,
} from "./dexie/tables.js";

export class IDBDatabaseBackend implements DatabaseBackend {
  db: DexieDatabase;

  constructor(
    databaseName = "OrbitDatabase",
    indexedDB: IDBFactory = window.indexedDB,
  ) {
    this.db = new DexieDatabase(databaseName, indexedDB);
  }

  async close(): Promise<void> {
    // Warning: we have no way to ensure that all writes have resolved before this statement completes
    this.db.close();
  }

  async getEntities<E extends Entity, ID extends IDOfEntity<E>>(
    entityIDs: ID[],
  ): Promise<Map<ID, DatabaseBackendEntityRecord<E>>> {
    if (entityIDs.length === 0) {
      return new Map();
    }

    const rows = await this.db.entities
      .where(DexieEntityKeys.ID)
      .anyOf(entityIDs)
      .toArray();
    return extractEntityRecordMapFromRows(rows);
  }

  async getEvents<E extends Event, ID extends EventID>(
    eventIDs: ID[],
  ): Promise<Map<ID, E>> {
    const values = await this.db.events
      .where(DexieEventKeys.ID)
      .anyOf(eventIDs)
      .toArray();

    const output: Map<ID, E> = new Map();
    for (const value of values) {
      if (!value) continue;
      const entity: E = JSON.parse(value.data);
      output.set(value.id as ID, entity);
    }
    return output;
  }

  async listEntities<E extends Entity>(
    query: DatabaseEntityQuery<E>,
  ): Promise<DatabaseBackendEntityRecord<E>[]> {
    let request: PromiseExtended<DexieEntityRow[]>;
    if (query.predicate) {
      const includedEntityIDs = new Set<EntityID>();
      // only one possible key right now, when another key is eventually defined convert this
      // to be an if-else
      // We don't need to filter by entityType in this case because dueTimestamp only applies
      // to tasks. Other predicates may require filtering by entityType.
      switch (query.predicate[0]) {
        case DexieDerivedTaskComponentKeys.DueTimestampMillis:
          const clause = this.db.derived_taskComponents.where(
            DexieDerivedTaskComponentKeys.DueTimestampMillis,
          );
          const derivedRowsPrimaryKeys = await compareUsingPredicate(
            clause,
            query.predicate,
          ).primaryKeys();

          for (const [derivedPrimaryKey] of derivedRowsPrimaryKeys) {
            includedEntityIDs.add(derivedPrimaryKey as EntityID);
          }
      }

      // was the afterID specified at the same time?
      if (query.afterID) {
        // simulate a join across the two tables
        const afterRowID = await this._fetchPrimaryKeyFromUniqueKey(
          this.db.entities,
          DexieEventKeys.ID,
          query.afterID,
        );

        // Note that our approach here involves fetching _all_ matching entity IDs, then skipping the
        // ones before the requested row. This means pagination over N entities with a predicate has
        // quadratic time cost.
        // rows are already sorted since we are using the primary key index
        const baseQuery = this.db.entities
          .where(DexieEntityKeys.RowID)
          .above(afterRowID)
          .filter((row) => includedEntityIDs.has(row.id));
        request = applyOptionalLimit(baseQuery, query.limit).toArray();
      } else {
        const baseQuery = this.db.entities
          .where(DexieEntityKeys.ID)
          .anyOf([...includedEntityIDs]);
        request = applyOptionalLimit(baseQuery, query.limit).sortBy(
          DexieEntityKeys.RowID,
        );
      }
    } else {
      const afterRowID = query.afterID
        ? await this._fetchPrimaryKeyFromUniqueKey(
            this.db.entities,
            DexieEventKeys.ID,
            query.afterID,
          )
        : null;
      const baseQuery = this.db.entities
        .where(`[${DexieEntityKeys.EntityType}+${DexieEntityKeys.RowID}]`)
        .between(
          [query.entityType, afterRowID === null ? 0 : afterRowID + 1],
          [query.entityType, Dexie.Dexie.maxKey],
        );
      // We don't need to explicitly sort the result, because rowID is the final column of this compound index.
      request = applyOptionalLimit(baseQuery, query.limit).toArray();
    }

    const queriedEntities = await request;
    return queriedEntities.map((entity) => ({
      lastEventID: entity.lastEventID,
      lastEventTimestampMillis: entity.lastEventTimestampMillis,
      entity: JSON.parse(entity.data),
    }));
  }

  async listEvents(query: DatabaseEventQuery): Promise<Event[]> {
    let request: PromiseExtended<DexieEventRow[]>;

    if (query.predicate && query.afterID) {
      const afterSequenceNumber = await this._fetchPrimaryKeyFromUniqueKey(
        this.db.events,
        DexieEventKeys.ID,
        query.afterID,
      );

      // both the predicate and afterID were specified need to do more complex querying
      if (query.predicate[1] == "=") {
        // can create a compound query in this case. It is already sorted since the primary key is the final
        // column of the index
        const baseQuery = this.db.events
          .where(`[${query.predicate[0]}+${DexieEventKeys.SequenceNumber}]`)
          .between(
            [query.predicate[2], afterSequenceNumber + 1],
            [query.predicate[2], Dexie.Dexie.maxKey],
          );

        request = applyOptionalLimit(baseQuery, query.limit).toArray();
      } else {
        // arbitrary comparison query
        const predicatedQuery = this.db.events.where(
          query.predicate[0],
        ) as WhereClause<DexieEventRowWithPrimaryKey, number>;

        const baseQuery = compareUsingPredicate(
          predicatedQuery,
          query.predicate,
        ).filter(
          (item) => item[DexieEventKeys.SequenceNumber] > afterSequenceNumber,
        );
        request = applyOptionalLimit(baseQuery, query.limit).sortBy(
          DexieEventKeys.SequenceNumber,
        );
      }
    } else if (query.predicate) {
      const predicatedQuery = this.db.events.where(query.predicate[0]);
      request = applyOptionalLimit(
        compareUsingPredicate(predicatedQuery, query.predicate),
        query.limit,
      ).sortBy(DexieEventKeys.SequenceNumber);
    } else if (query.afterID) {
      const afterSequenceNumber = await this._fetchPrimaryKeyFromUniqueKey(
        this.db.events,
        DexieEventKeys.ID,
        query.afterID,
      );

      // already sorted since fetching using primary key;
      const baseQuery = this.db.events
        .where(DexieEventKeys.SequenceNumber)
        .above(afterSequenceNumber);
      request = applyOptionalLimit(baseQuery, query.limit).toArray();
    } else {
      request = applyOptionalLimit(
        this.db.events.toCollection(),
        query.limit,
      ).toArray();
    }

    const queriedEvents: DexieEventRow[] = await request;
    return queriedEvents.map((event) => JSON.parse(event.data));
  }

  async updateEntities<E extends Entity>(
    events: EventForEntity<E>[],
    transformer: (
      eventsPendingSave: EventForEntity<E>[],
      entityRecordMap: Map<IDOfEntity<E>, DatabaseBackendEntityRecord<E>>,
    ) => Promise<Map<IDOfEntity<E>, DatabaseBackendEntityRecord<E>>>,
  ): Promise<void> {
    // Attempt to write the events and entities. If some events are duplicates, we'll re-run this function with only the new events.
    await this.db.transaction(
      "readwrite",
      this.db.entities,
      this.db.events,
      this.db.derived_taskComponents,
      async () => {
        // Fetch the old entities.
        const entityIDs = new Set(events.map(({ entityID }) => entityID));
        const oldEntityRows = (await this.db.entities
          .where(DexieEntityKeys.ID)
          .anyOf([...entityIDs])
          .toArray()) as DexieEntityRowWithPrimaryKey[];
        const entityIDsToRowIDs = new Map(
          oldEntityRows.map(({ rowID, id }) => [id, rowID]),
        );
        const oldEntityRecordMap = extractEntityRecordMapFromRows<
          E,
          IDOfEntity<E>
        >(oldEntityRows);

        // Determine which events are new--unfortunately, there's no "cheap" way for us to only insert events which we were missing.
        const oldEvents = await this.getEvents(events.map(({ id }) => id));
        const eventsToAdd = events.filter(({ id }) => !oldEvents.has(id));

        // Compute the new entities.
        const newEntityRecordMap = await transformer(
          eventsToAdd,
          oldEntityRecordMap,
        );

        // Write the new entities.
        const newEntityRows = Array<
          // We may or may not have a rowID: we will if it's an existing row, and not otherwise.
          DexieEntityRow & { [DexieEntityKeys.RowID]?: number }
        >();
        for (const [id, record] of newEntityRecordMap) {
          const rowID = entityIDsToRowIDs.get(id);
          newEntityRows.push({
            ...getEntityRowForEntityRecord(record),
            // We include the old row ID if we had a record for this row before; otherwise, it's a new entity, and the DB will assign it a row ID.
            ...(rowID !== undefined && { rowID }),
          });

          await this._onEntityUpdate(
            oldEntityRecordMap.get(id)?.entity ?? null,
            record.entity,
          );
        }

        await this.db.entities.bulkPut(newEntityRows);

        await this.db.events.bulkAdd(
          eventsToAdd.map((event) => ({
            entityID: event.entityID,
            id: event.id,
            data: JSON.stringify(event),
          })),
        );
      },
    );
  }

  private async _onEntityUpdate(
    oldEntity: Entity | null,
    newEntity: Entity,
  ): Promise<void> {
    if (newEntity.type !== EntityType.Task) {
      return;
    }

    if (oldEntity) {
      await this.db[DexieTable.DerivedTaskComponents]
        .where(DexieDerivedTaskComponentKeys.TaskID)
        .equals(oldEntity.id)
        .delete();
    }
    if (!newEntity.isDeleted) {
      await this.db[DexieTable.DerivedTaskComponents].bulkPut(
        Object.entries(newEntity.componentStates).map(
          ([componentID, value]) => ({
            taskID: newEntity.id,
            componentID,
            dueTimestampMillis: value.dueTimestampMillis,
          }),
        ),
      );
    }
  }

  async getMetadataValues<Key extends string>(
    keys: Key[],
  ): Promise<Map<Key, string>> {
    const results = await this.db.metadata.bulkGet(keys);
    const output = new Map<Key, string>();
    for (let i = 0; i < keys.length; i++) {
      const value = results[i]?.value;
      if (value) {
        output.set(keys[i], value);
      }
    }
    return output;
  }

  async setMetadataValues(values: Map<string, string | null>): Promise<void> {
    await this.db.metadata.bulkPut(
      [...values.entries()].map(([key, value]) => ({ key, value })),
    );
  }

  async _fetchPrimaryKeyFromUniqueKey<Row, PK>(
    table: Dexie.Table<Row, PK>,
    key: string,
    value: IndexableType,
  ): Promise<PK> {
    // there will never be more than one key
    const afterRowPrimaryKeys = await table
      .where(key)
      .equals(value)
      .primaryKeys();
    return afterRowPrimaryKeys[0];
  }
}

function applyOptionalLimit<Row, PK>(
  query: Collection<Row, PK>,
  limit: number | undefined,
) {
  if (limit) {
    return query.limit(limit);
  } else {
    return query;
  }
}

function compareUsingPredicate<
  Row,
  PK,
  Key extends string,
  Value extends IndexableType,
>(
  clause: WhereClause<Row, PK>,
  predicate: DatabaseQueryPredicate<Key, DatabaseQueryPredicateRelation, Value>,
) {
  switch (predicate[1]) {
    case "<":
      return clause.below(predicate[2]);
    case "<=":
      return clause.belowOrEqual(predicate[2]);
    case "=":
      return clause.equals(predicate[2]);
    case ">":
      return clause.above(predicate[2]);
    case ">=":
      return clause.aboveOrEqual(predicate[2]);
  }
}

// It's the responsibility of the caller to ensure that the IDs in the listed rows correspond to those of the ID type.
function extractEntityRecordMapFromRows<
  E extends Entity,
  ID extends IDOfEntity<E>,
>(rows: Array<DexieEntityRow>): Map<ID, DatabaseBackendEntityRecord<E>> {
  const output: Map<ID, DatabaseBackendEntityRecord<E>> = new Map();
  for (const value of rows) {
    if (!value) continue;
    const entity: E = JSON.parse(value.data);
    output.set(value.id as ID, {
      lastEventID: value.lastEventID as EventID,
      lastEventTimestampMillis: value.lastEventTimestampMillis,
      entity,
    });
  }
  return output;
}

function getEntityRowForEntityRecord(
  record: DatabaseBackendEntityRecord<Entity>,
): DexieEntityRow {
  return {
    id: record.entity.id,
    entityType: record.entity.type,
    lastEventID: record.lastEventID,
    lastEventTimestampMillis: record.lastEventTimestampMillis,
    data: JSON.stringify(record.entity),
  };
}
