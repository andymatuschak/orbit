import { Entity, Event, EventID, IDOfEntity } from "../../core2";
import { DatabaseEntityQuery, DatabaseEventQuery } from "../../database";
import { DatabaseBackend, DatabaseBackendEntityRecord } from "../backend";

// TODO: remove this directive
/* eslint-disable */

// TODO: Implement IDB backend. Dexie.js looks like a good choice.
export class IDBDatabaseBackend implements DatabaseBackend {
  close(): Promise<void> {
    return Promise.resolve(undefined);
  }

  getEntities<E extends Entity, ID extends IDOfEntity<E>>(
    entityIDs: ID[],
  ): Promise<Map<ID, DatabaseBackendEntityRecord<E>>> {
    // @ts-ignore
    return Promise.resolve(undefined);
  }

  getEvents<E extends Event, ID extends EventID>(
    eventIDs: EventID[],
  ): Promise<Map<ID, E>> {
    // @ts-ignore
    return Promise.resolve(undefined);
  }

  listEntities<E extends Entity>(
    query: DatabaseEntityQuery<E>,
  ): Promise<DatabaseBackendEntityRecord<E>[]> {
    return Promise.resolve([]);
  }

  listEvents(query: DatabaseEventQuery): Promise<Event[]> {
    return Promise.resolve([]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  putEntities(entities: DatabaseBackendEntityRecord<Entity>[]): Promise<void> {
    return Promise.resolve(undefined);
  }

  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  putEvents(events: Event[]): Promise<void> {
    return Promise.resolve(undefined);
  }
}
