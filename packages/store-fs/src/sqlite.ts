import { Entity, Event, EventID, IDOfEntity } from "@withorbit/core2";
import {
  DatabaseEntityQuery,
  DatabaseEventQuery,
  DatabaseQueryOptions,
  DatabaseQueryPredicate,
  DatabaseBackend,
  DatabaseBackendEntityRecord,
} from "@withorbit/store-shared";
import { openDatabase } from "./sqlite/binding";
import { performMigration } from "./sqlite/migration";
import {
  SQLEntityTableColumn,
  SQLEventTableColumn,
  SQLTableName,
} from "./sqlite/tables";
import { execReadStatement, execTransaction } from "./sqlite/transactionUtils";
import { SQLDatabase } from "./sqlite/types";

/*

SQLite-based implementation of an Orbit database backend.

Running list of implementation problems / gotchas:
1. expo-sqlite doesn't support a real close() operation[1]. A few implications:
  a. opening/closing many databases in a React Native context will leak resources
  b. clients can't know exactly when all writes are complete--but I don't think that's relevant in practice
  c. the database must be run in WAL mode at all times to avoid iOS killing us for holding a database lock while suspended

2. Our transaction primitives don't give us enough control to safely isolate schema migration. Simultaneous migrations could occur in the context of multiple processes accessing the same database, or multiple instances in the same process reading the same database. In practice, this probably won't cause corruption: most likely the migration transaction will simply fail in one process. But in the future complex migrations could partially succeed. At some point we should consider flock()ing during migration.

3. modifyEntities() isn't atomic/transactional; see comment in that method for more.

[1] https://github.com/expo/expo/issues/2278
 */

export class SQLDatabaseBackend implements DatabaseBackend {
  private _db: SQLDatabase | null;
  private readonly _migrationPromise: Promise<void>;

  constructor(subpath: string) {
    this._db = openDatabase(subpath);
    this._migrationPromise = performMigration(this._db);
  }
  static inMemoryDBSubpath = ":memory:"; // Pass to constructor to create an in-memory database
  static tempDBSubpath = ""; // Pass to constructor to create a temporary database file

  async close(): Promise<void> {
    await this._ensureDB();
    this._db = null;
    // Warning: we have no way to ensure that all writes have resolved before resolving this promise; this is a weakness in the WebSQL API (which is passed down to our implementations).
    return Promise.resolve();
  }

  getEntities<E extends Entity, ID extends IDOfEntity<E>>(
    entityIDs: ID[],
  ): Promise<Map<ID, DatabaseBackendEntityRecord<E>>> {
    return this._getByID(
      SQLTableName.Entities,
      SQLEntityTableColumn.ID,
      [
        SQLEntityTableColumn.ID,
        SQLEntityTableColumn.LastEventID,
        SQLEntityTableColumn.LastEventTimestampMillis,
        SQLEntityTableColumn.Data,
      ],
      entityIDs,
      ({ id, lastEventID, lastEventTimestampMillis, data }) => {
        const entity: E = JSON.parse(data);
        return [id, { lastEventID, lastEventTimestampMillis, entity }];
      },
    );
  }

  // TODO: This implementation doesn't yet provide transactional guarantees. We can't use SQL transactions directly here (because we have to return control to the caller), but we should implement atomicity anyway (e.g. by rolling back and retrying when the updated entity IDs have the same lastEventID as the initial ones; this isn't straightforward, so I'm deferring this work for now).
  async modifyEntities<E extends Entity, ID extends IDOfEntity<E>>(
    ids: ID[],
    transformer: (
      row: Map<ID, DatabaseBackendEntityRecord<E>>,
    ) => Promise<Map<ID, DatabaseBackendEntityRecord<E>>>,
  ): Promise<void> {
    const entityRecordMap = await this.getEntities<E, ID>(ids);
    const transformedEntityRecordMap = await transformer(entityRecordMap);
    await this.putEntities([...transformedEntityRecordMap.values()]);
  }

  putEntities(
    entityRecords: DatabaseBackendEntityRecord<Entity>[],
  ): Promise<void> {
    return this._put({
      tableName: SQLTableName.Entities,
      orderedColumnNames: [
        SQLEntityTableColumn.ID,
        SQLEntityTableColumn.EntityType,
        SQLEntityTableColumn.LastEventID,
        SQLEntityTableColumn.LastEventTimestampMillis,
        SQLEntityTableColumn.Data,
      ],
      rows: entityRecords.map((record) => [
        record.entity.id,
        record.entity.type,
        record.lastEventID,
        record.lastEventTimestampMillis,
        JSON.stringify(record.entity),
      ]),
      upsertSpec: {
        uniqueColumnName: SQLEntityTableColumn.ID,
        updateColumnNames: [
          SQLEntityTableColumn.LastEventID,
          SQLEntityTableColumn.LastEventTimestampMillis,
          SQLEntityTableColumn.Data,
        ],
      },
    });
  }

  getEvents<E extends Event, ID extends EventID>(
    eventIDs: EventID[],
  ): Promise<Map<ID, E>> {
    return this._getByID(
      SQLTableName.Events,
      SQLEventTableColumn.ID,
      [SQLEventTableColumn.ID, SQLEventTableColumn.Data],
      eventIDs,
      ({ data, id }) => {
        const event: E = JSON.parse(data);
        return [id, event];
      },
    );
  }

  putEvents(events: Event[]): Promise<void> {
    return this._put({
      tableName: SQLTableName.Events,
      orderedColumnNames: [
        SQLEventTableColumn.ID,
        SQLEventTableColumn.EntityID,
        SQLEventTableColumn.Data,
      ],
      rows: events.map((event) => [
        event.id,
        event.entityID,
        JSON.stringify(event),
      ]),
    });
  }

  async listEntities<E extends Entity>(
    query: DatabaseEntityQuery<E>,
  ): Promise<DatabaseBackendEntityRecord<E>[]> {
    const sqlQuery = constructListEntitySQLQuery(query);
    const results = await execReadStatement(
      await this._ensureDB(),
      sqlQuery.statement,
      sqlQuery.args,
    );
    const output: DatabaseBackendEntityRecord<E>[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      output.push({
        entity: JSON.parse(row[SQLEntityTableColumn.Data]),
        lastEventID: row[SQLEntityTableColumn.LastEventID],
        lastEventTimestampMillis:
          row[SQLEntityTableColumn.LastEventTimestampMillis],
      });
    }
    return output;
  }

  async listEvents(query: DatabaseEventQuery): Promise<Event[]> {
    const sqlQuery = constructListEventSQLQuery(query);
    const results = await execReadStatement(
      await this._ensureDB(),
      sqlQuery.statement,
      sqlQuery.args,
    );

    const output: Event[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      output.push(JSON.parse(row[SQLEventTableColumn.Data]));
    }
    return output;
  }

  private async _put({
    tableName,
    orderedColumnNames,
    rows,
    upsertSpec,
  }: {
    tableName: SQLTableName;
    orderedColumnNames: string[];
    rows: unknown[][];
    // When provided, if a uniqueness constraint fails for uniqueColumnName, the existing row will be updated to the new row's values for the columns specified in updateColumnNames (i.e. an upsert).
    upsertSpec?: {
      uniqueColumnName: string;
      updateColumnNames: string[];
    };
  }): Promise<void> {
    const db = await this._ensureDB();
    await execTransaction(db, (tx) => {
      const placeholderString = rows
        .map((row) => `(${row.map(() => "?").join(",")})`)
        .join(",");
      let insertSQLStatement = `INSERT INTO ${tableName} (${orderedColumnNames.join(
        ",",
      )}) VALUES ${placeholderString}`;

      if (upsertSpec) {
        insertSQLStatement += `ON CONFLICT(${
          upsertSpec.uniqueColumnName
        }) DO UPDATE SET ${upsertSpec.updateColumnNames
          .map((name) => `${name} = excluded.${name}`)
          .join(", ")}`;
      }

      tx.executeSql(insertSQLStatement, rows.flat());
    });
  }

  private async _getByID<ID extends string, Column extends string, Output>(
    tableName: SQLTableName,
    idColumnName: string,
    columnNames: Column[],
    ids: ID[],
    rowMapping: (row: { [C in Column]: any }) => [id: ID, value: Output],
  ): Promise<Map<ID, Output>> {
    const db = await this._ensureDB();
    const resultSet = await execReadStatement(
      db,
      constructGetByIDSQLQuery(tableName, idColumnName, columnNames, ids),
      ids,
    );
    const { rows } = resultSet;

    const output: Map<ID, Output> = new Map();
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const [id, value] = rowMapping(rows.item(rowIndex));
      output.set(id, value);
    }
    return output;
  }

  private async _ensureDB(): Promise<SQLDatabase> {
    if (this._db) {
      await this._migrationPromise;
      return this._db;
    } else {
      throw new Error("Attempting to access database after it's been cloesd");
    }
  }

  async __accessDBForTesting(): Promise<SQLDatabase> {
    return this._ensureDB();
  }
}

export function constructListEntitySQLQuery<E extends Entity>(
  query: DatabaseEntityQuery<E>,
): { statement: string; args: any[] } {
  const predicates: DatabaseQueryPredicate<any, any>[] = query.predicate
    ? [query.predicate]
    : [];

  const columns = [
    SQLEntityTableColumn.LastEventID,
    SQLEntityTableColumn.LastEventTimestampMillis,
    SQLEntityTableColumn.Data,
  ];
  if (query.predicate?.[0] === "dueTimestampMillis") {
    // Special case using the derived_taskComponents index table.
    return constructListSQLQuery({
      tableExpression: `derived_taskComponents AS dt JOIN ${SQLTableName.Entities} AS e ON (dt.taskID = e.${SQLEntityTableColumn.ID})`,
      idKey: SQLEntityTableColumn.ID,
      orderKey: SQLEntityTableColumn.RowID,
      columns,
      options: query,
      predicates, // We don't need to include the entity type because derived_taskComponents only contains references to tasks.
    });
  } else {
    return constructListSQLQuery({
      tableExpression: SQLTableName.Entities,
      idKey: SQLEntityTableColumn.ID,
      orderKey: SQLEntityTableColumn.RowID,
      columns,
      options: query,
      predicates: [["entityType", "=", query.entityType], ...predicates],
    });
  }
}

export function constructListEventSQLQuery(query: DatabaseEventQuery): {
  statement: string;
  args: any[];
} {
  return constructListSQLQuery({
    tableExpression: SQLTableName.Events,
    idKey: SQLEventTableColumn.ID,
    orderKey: SQLEventTableColumn.SequenceNumber,
    columns: [SQLEventTableColumn.Data],
    options: query,
    predicates: query.predicate ? [query.predicate] : [],
  });
}

function constructListSQLQuery({
  tableExpression,
  idKey,
  orderKey,
  columns,
  options,
  predicates,
}: {
  tableExpression: SQLTableName | string;
  idKey: string;
  orderKey: string;
  columns: string[];
  options: DatabaseQueryOptions<any>;
  predicates: DatabaseQueryPredicate<any, any>[];
}): { statement: string; args: any[] } {
  const args: any[] = [];

  const whereExpressions: string[] = [];

  for (const predicate of predicates) {
    whereExpressions.push(`${predicate[0]} ${predicate[1]} ?`);
    args.push(predicate[2]);
  }

  if (options.afterID) {
    whereExpressions.push(
      `${orderKey} > (SELECT ${orderKey} FROM ${tableExpression} WHERE ${idKey}=?)`,
    );
    args.push(options.afterID);
  }

  const whereClause =
    whereExpressions.length > 0
      ? `WHERE ${whereExpressions.join(" AND ")}`
      : "";
  const limitClause =
    options.limit === undefined ? "" : `LIMIT ${options.limit}`;

  const query = `SELECT ${columns.join(
    ",",
  )} FROM ${tableExpression} ${whereClause} ${limitClause}`;
  return { statement: query, args };
}

export function constructGetByIDSQLQuery<Column, ID>(
  tableName: SQLTableName,
  idColumnName: string,
  columnNames: Column[],
  ids: ID[],
) {
  return `SELECT ${columnNames.join(
    ",",
  )} FROM ${tableName} WHERE ${idColumnName} IN (${ids
    .map(() => `?`)
    .join(",")})`;
}
