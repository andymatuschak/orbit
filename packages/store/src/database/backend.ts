import { Entity, Event, EventID, IDOfEntity } from "../core2";
import { DatabaseEntityQuery, DatabaseEventQuery } from "../database";

export interface DatabaseBackend {
  close(): Promise<void>;

  getEvents<E extends Event, ID extends EventID>(
    eventIDs: EventID[],
  ): Promise<Map<ID, E>>;
  putEvents(events: Event[]): Promise<void>;

  getEntities<E extends Entity, ID extends IDOfEntity<E>>(
    entityIDs: ID[],
  ): Promise<Map<ID, DatabaseBackendEntityRecord<E>>>;
  putEntities(entities: DatabaseBackendEntityRecord<Entity>[]): Promise<void>;
  modifyEntities<E extends Entity, ID extends IDOfEntity<E>>(
    ids: ID[],
    transformer: (
      entityRecordMap: Map<ID, DatabaseBackendEntityRecord<E>>,
    ) => Promise<Map<ID, DatabaseBackendEntityRecord<E>>>,
  ): Promise<void>;

  // Returns events in an arbitrary order which is stable on this client (i.e. so paging using afterID is safe), but which is not guaranteed to be consistent across clients.
  listEvents(query: DatabaseEventQuery): Promise<Event[]>;

  // Returns entities in an arbitrary order which is stable on this client (i.e. so paging using afterID is safe), but which is not guaranteed to be consistent across clients.
  listEntities<E extends Entity>(
    query: DatabaseEntityQuery<E>,
  ): Promise<DatabaseBackendEntityRecord<E>[]>;
}

// We persist entities wrapped with extra metadata used for updating snapshots.
export interface DatabaseBackendEntityRecord<E extends Entity> {
  entity: E;

  // Here, "last" refers to the local logical clock (i.e. sequence number), rather than client-local time.
  lastEventID: EventID;
  lastEventTimestampMillis: number; // Denormalizing this here lets us determine if new events can be applied directly without fetching the last event.
}
