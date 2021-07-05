import {
  Entity,
  EntityID,
  Event,
  EventID,
  IDOfEntity,
  Task,
  TaskID,
  TypeOfEntity,
  eventReducer as _eventReducer,
} from "./core2";
import {
  DatabaseBackend,
  DatabaseBackendEntityRecord,
} from "./database/backend";

// The Database offers interfaces for storing and querying events and the entities generated from those events.
export class Database {
  // DatabaseBackend does most of the work here; Database wraps that interface with the entity-generation logic.
  private readonly _backend: DatabaseBackend;

  // The event reducer specifies how entities are generated from events. Note that Database doesn't know anything about any specific event or entity types; it's a general event source implementation.
  private readonly _eventReducer: EventReducer;

  constructor(
    backend: DatabaseBackend,
    eventReducer: EventReducer = _eventReducer,
  ) {
    this._backend = backend;
    this._eventReducer = eventReducer;
  }

  close(): Promise<void> {
    return this._backend.close();
  }

  async putEvents(events: Event[]): Promise<void> {
    await this._backend.putEvents(events);

    const affectedEntityIDs = new Set(events.map(({ entityID }) => entityID));
    await this._updateEntitySnapshots([...affectedEntityIDs]);
  }

  getEvents<E extends Event, ID extends EventID>(
    eventIDs: EventID[],
  ): Promise<Map<ID, E>> {
    return this._backend.getEvents(eventIDs);
  }

  async getEntities<E extends Entity, ID extends IDOfEntity<E>>(
    entityIDs: ID[],
  ): Promise<Map<ID, E>> {
    const records = await this._backend.getEntities<E, ID>(entityIDs);
    return new Map(
      [...records.entries()].map(([id, record]) => [id, record.entity]),
    );
  }

  // Returns events in an arbitrary order which is stable on this client (i.e. so paging using afterID is safe), but which is not guaranteed to be consistent across clients.
  listEvents(query: DatabaseEventQuery): Promise<Event[]> {
    return this._backend.listEvents(query);
  }

  // Returns entities in an arbitrary order which is stable on this client (i.e. so paging using afterID is safe), but which is not guaranteed to be consistent across clients.
  async listEntities<E extends Entity>(
    query: DatabaseEntityQuery<E>,
  ): Promise<Entity[]> {
    const records = await this._backend.listEntities(query);
    return records.map(({ entity }) => entity);
  }

  private async _updateEntitySnapshots(entityIDs: EntityID[]): Promise<void> {
    // n.b. this method is conceivably open to races because we can't wrap the full update loop in a transaction handler, but I don't think it's an issue in practice. Worst case, the snapshot ends up behind the latest event, but it'd be corrected in the next snapshot update.

    // TODO: Note the unsafe cast to TaskID below. This shouldn't be necessary, but TS has figured out that there's only one entity type right now, and therefore there's only one EntityID type, and it's TaskID, and so that's what it demands as the argument.
    const _entityIDs = entityIDs as TaskID[];
    const batchSize = 100;
    for (let i = 0; i < _entityIDs.length; i += batchSize) {
      const currentEntityRecordSnapshots = await this._backend.getEntities(
        _entityIDs,
      );
      const newEntityRecordSnapshots = await Promise.all(
        _entityIDs
          .slice(i, i + batchSize)
          .map(
            async (id) =>
              await this._computeUpdatedEntitySnapshot(
                id,
                currentEntityRecordSnapshots.get(id) ?? null,
              ),
          ),
      );
      await this._backend.putEntities(newEntityRecordSnapshots);
    }
  }

  private async _computeUpdatedEntitySnapshot(
    entityID: EntityID,
    currentRecordSnapshot: DatabaseBackendEntityRecord<Entity> | null,
  ): Promise<DatabaseBackendEntityRecord<Entity>> {
    // TODO: attempt to fast-forward by applying events incrementally on the snapshot if possible (i.e. if all the new events' client timestamps are greater than the greatest previous client timestamp)
    const events = await this._backend.listEvents({
      predicate: ["entityID", "=", entityID],
    });
    const lastEventID = events[events.length - 1];
    if (events.length > 0) {
      events.sort((a, b) => a.timestampMillis - b.timestampMillis);
      const newEntitySnapshot = events.reduce(
        (snapshot, event) => this._eventReducer(snapshot, event),
        currentRecordSnapshot?.entity ?? null,
      );
      // TS can't reason about array parity.
      if (!newEntitySnapshot) {
        throw new Error("unreachable");
      }
      return { entity: newEntitySnapshot, lastEventID: lastEventID.id };
    } else {
      throw new Error(
        `Attempting to update snapshot for entity ${entityID}, but no events are present.`,
      );
    }
  }
}

export interface DatabaseEventQuery extends DatabaseQueryOptions<EventID> {
  predicate?: DatabaseQueryPredicate<"entityID", string>;
}

export type DatabaseEntityQuery<E extends Entity> = DatabaseQueryOptions<
  IDOfEntity<E>
> & {
  entityType: TypeOfEntity<E>;
  predicate?: E extends Task ? DatabaseTaskQueryPredicate : never;
};

export type DatabaseTaskQueryPredicate = DatabaseQueryPredicate<
  "dueTimestampMillis",
  number
>;

export type DatabaseQueryPredicate<Key extends string, Value> = readonly [
  key: Key,
  relation: "=" | "<" | "<=" | ">" | ">=",
  value: Value,
];

export type DatabaseQueryOptions<ID extends string> = {
  afterID?: ID;
  limit?: number;
};

export type EventReducer = (
  entitySnapshot: Entity | null,
  event: Event,
) => Entity;
