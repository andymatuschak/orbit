import {
  Entity,
  EntityID,
  Event,
  EventID,
  eventReducer as _eventReducer,
  IDOfEntity,
} from "@withorbit/core";
import {
  DatabaseBackend,
  DatabaseBackendEntityRecord,
} from "./databaseBackend.js";
import { DatabaseEntityQuery, DatabaseEventQuery } from "./databaseQuery.js";
import { AjvEventsValidator } from "./validation/AjvEventsValidator.js";
import { EventsValidator } from "./validation/eventsValidator.js";

const _ajvEventValidator = new AjvEventsValidator();

// The Database offers interfaces for storing and querying events and the entities generated from those events.
export class Database {
  // DatabaseBackend does most of the work here; Database wraps that interface with the entity-generation logic.
  private readonly _backend: DatabaseBackend;

  // The event reducer specifies how entities are generated from events. Note that Database doesn't know anything about any specific event or entity types; it's a general event source implementation.
  private readonly _eventReducer: EventReducer;
  // Validator to ensure that the events match type declarations of the events
  private readonly _eventValidator: EventsValidator;

  constructor(
    backend: DatabaseBackend,
    eventReducer: EventReducer = _eventReducer,
    eventValidator: EventsValidator = _ajvEventValidator,
  ) {
    this._backend = backend;
    this._eventReducer = eventReducer;
    this._eventValidator = eventValidator;
  }

  close(): Promise<void> {
    return this._backend.close();
  }

  async putEvents(
    events: Event[],
  ): Promise<{ event: Event; entity: Entity }[]> {
    const eventValidationResult = this._eventValidator.validateEvents(events);
    if (eventValidationResult !== true) {
      return new Promise((_, reject) => reject(eventValidationResult));
    }
    if (events.length === 0) return [];

    let output: { event: Event; entity: Entity }[] | undefined;
    await this._backend.updateEntities<Entity>(
      events,
      async (eventsPendingSave, currentEntityRecordMap) => {
        const eventsByEntityID = new Map<EntityID, Event[]>();
        for (const event of eventsPendingSave) {
          eventsByEntityID.set(event.entityID, [
            ...(eventsByEntityID.get(event.entityID) ?? []),
            event,
          ]);
        }

        const entityUpdates = await Promise.all(
          [...eventsByEntityID.entries()].map(([id, events]) =>
            this._computeUpdatedEntitySnapshot(
              id,
              currentEntityRecordMap.get(id) ?? null,
              events,
            ),
          ),
        );

        output = entityUpdates.flat();
        return new Map(
          entityUpdates.map((updates) => {
            const lastUpdate = updates[updates.length - 1];
            return [
              lastUpdate.entity.id,
              {
                entity: lastUpdate.entity,
                lastEventID: lastUpdate.event.id,
                lastEventTimestampMillis: lastUpdate.event.timestampMillis,
              },
            ] as const;
          }),
        );
      },
    );

    if (output === undefined) {
      throw new Error(`Inconsistent: output didn't get set in updateEntities`);
    }

    // Only return entries corresponding to the new events.
    const eventIDs = new Set(events.map(({ id }) => id));
    return output.filter(({ event: { id } }) => eventIDs.has(id));
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
  ): Promise<E[]> {
    const records = await this._backend.listEntities(query);
    return records.map(({ entity }) => entity);
  }

  // Reads a small, top-level value, useful for configuration and lightweight state tracking.
  async getMetadataValues<Key extends string>(
    keys: Key[],
  ): Promise<Map<Key, string>> {
    return await this._backend.getMetadataValues(keys);
  }

  // Writes a small, top-level value, useful for configuration and lightweight state tracking.
  async setMetadataValues(values: Map<string, string | null>): Promise<void> {
    await this._backend.setMetadataValues(values);
  }

  private async _computeUpdatedEntitySnapshot(
    entityID: EntityID,
    currentRecord: DatabaseBackendEntityRecord<Entity> | null,
    newEvents: Event[],
  ): Promise<{ event: Event; entity: Entity }[]> {
    const _computeUpdatedEntityWithEvents = (
      snapshot: Entity | null,
      events: Event[],
    ) => {
      const output: { event: Event; entity: Entity }[] = [];
      let currentEntity: Entity | null = snapshot;
      for (const event of events) {
        try {
          const entity = this._eventReducer(currentEntity, event);
          output.push({ event, entity });
          currentEntity = entity;
        } catch (error) {
          throw new Error(
            `Error updating entity ${entityID}: ${error}; snapshot: ${JSON.stringify(
              snapshot,
              null,
              "\t",
            )}; new events: ${JSON.stringify(events, null, "\t")}`,
          );
        }
      }
      return output;
    };

    newEvents.sort(compareEvents);
    // Most of the time, new events will be ordered after old events (in terms of local client time), which means we can apply them directly on top of our existing snapshot.
    if (
      newEvents.length > 0 &&
      (!currentRecord ||
        newEvents[0].timestampMillis > currentRecord.lastEventTimestampMillis)
    ) {
      // Apply the new events on top of the pre-existing snapshot.
      return _computeUpdatedEntityWithEvents(
        currentRecord?.entity ?? null,
        newEvents,
      );
    } else {
      // We've got an out-of-order event (or no prior snapshot). We'll recompute the snapshot from scratch.
      const events = (
        await this._backend.listEvents({
          predicate: ["entityID", "=", entityID],
        })
      ).concat(newEvents);
      if (events.length === 0) {
        throw new Error(
          `Attempting to update snapshot for entity ${entityID}, but no events are present.`,
        );
      }

      events.sort(compareEvents);
      return _computeUpdatedEntityWithEvents(null, events);
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
    return 0; // Preserve original event sequence when timestamp match.
  } else {
    return a.timestampMillis - b.timestampMillis;
  }
}
