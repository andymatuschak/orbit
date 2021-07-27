import {
  Entity,
  EntityID,
  Event,
  EventID,
  eventReducer as _eventReducer,
  IDOfEntity,
} from "@withorbit/core2";
import {
  DatabaseBackend,
  DatabaseBackendEntityRecord,
} from "./databaseBackend";
import { DatabaseEntityQuery, DatabaseEventQuery } from "./databaseQuery";

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
    await this._mergeEventsIntoEntitySnapshots(events);
  }

  getEvents<E extends Event, ID extends EventID>(
    eventIDs: ID[],
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

  // n.b. this method is conceivably open to races because we can't wrap the full update loop in a transaction handler, but I don't think it's an issue in practice. Worst case, the snapshot ends up behind the latest event, but it'd be corrected in the next snapshot update.
  private async _mergeEventsIntoEntitySnapshots(
    events: Event[],
  ): Promise<void> {
    const eventsByEntityID = new Map<EntityID, Event[]>();
    for (const event of events) {
      eventsByEntityID.set(event.entityID, [
        ...(eventsByEntityID.get(event.entityID) ?? []),
        event,
      ]);
    }
    const eventsByEntityIDEntries = [...eventsByEntityID.entries()];

    const batchSize = 100;
    for (let i = 0; i < eventsByEntityIDEntries.length; i += batchSize) {
      const batchEntries = eventsByEntityIDEntries.slice(i, i + batchSize);
      await this._backend.modifyEntities(
        batchEntries.map(([id]) => id),
        async (currentEntityRecordMap) => {
          const newSnapshotPromises: Promise<
            DatabaseBackendEntityRecord<Entity>
          >[] = [];
          for (const [id, events] of batchEntries) {
            newSnapshotPromises.push(
              this._computeUpdatedEntitySnapshot(
                id,
                currentEntityRecordMap.get(id) ?? null,
                events,
              ),
            );
          }

          const newSnapshots = await Promise.all(newSnapshotPromises);
          return new Map(
            newSnapshots.map((snapshot) => [snapshot.entity.id, snapshot]),
          );
        },
      );
    }
  }

  private async _computeUpdatedEntitySnapshot(
    entityID: EntityID,
    currentRecord: DatabaseBackendEntityRecord<Entity> | null,
    newEvents: Event[],
  ): Promise<DatabaseBackendEntityRecord<Entity>> {
    newEvents.sort(compareEvents);

    // Most of the time, new events will be ordered after old events (in terms of local client time), which means we can apply them directly on top of our existing snapshot.
    if (
      newEvents.length > 0 &&
      (!currentRecord ||
        newEvents[0].timestampMillis > currentRecord.lastEventTimestampMillis)
    ) {
      // Apply the new events on top of the pre-existing snapshot.
      const entity = newEvents.reduce(
        (snapshot, event) => this._eventReducer(snapshot, event),
        currentRecord?.entity ?? null,
      )!;
      const lastEvent = newEvents[newEvents.length - 1];
      return {
        entity,
        lastEventID: lastEvent.id,
        lastEventTimestampMillis: lastEvent.timestampMillis,
      };
    } else {
      // We've got an out-of-order event (or no prior snapshot). We'll recompute the snapshot from scratch.
      const events = await this._backend.listEvents({
        predicate: ["entityID", "=", entityID],
      });
      if (events.length === 0) {
        throw new Error(
          `Attempting to update snapshot for entity ${entityID}, but no events are present.`,
        );
      }

      events.sort(compareEvents);
      const lastEvent = events[events.length - 1];
      const newEntitySnapshot = events.reduce(
        (snapshot, event) => this._eventReducer(snapshot, event),
        null as Entity | null,
      );
      // TS can't reason about array parity. Because events.length > 0, and the reduce() accumulator returns Entity, this is guaranteed to be non-null.
      if (!newEntitySnapshot) {
        throw new Error("unreachable");
      }
      return {
        entity: newEntitySnapshot,
        lastEventID: lastEvent.id,
        lastEventTimestampMillis: lastEvent.timestampMillis,
      };
    }
  }
}

export type EventReducer = (
  entitySnapshot: Entity | null,
  event: Event,
) => Entity;

// Stable sorting functions for events
function compareEvents(a: Event, b: Event): number {
  if (a.timestampMillis === b.timestampMillis) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  } else {
    return a.timestampMillis - b.timestampMillis;
  }
}
