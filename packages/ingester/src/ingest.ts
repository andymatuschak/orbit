import {
  EntityType,
  Event,
  EventType,
  generateUniqueID,
  Task,
  TaskContent,
  TaskID,
  TaskIngestEvent,
  TaskProvenance,
  TaskUpdateDeletedEvent,
  TaskUpdateProvenanceEvent,
} from "@withorbit/core";
import { DatabaseEntityQuery, OrbitStore } from "@withorbit/store-shared";
import {
  IngestibleItem,
  IngestibleItemIdentifier,
  IngestibleSource,
} from "./ingestible.js";
import isEqual from "lodash.isequal";

type IngestOptions = {
  ingestDateMillis: number;
};
const DEFAULT_OPTIONS = (): IngestOptions => ({
  ingestDateMillis: Date.now(),
});

export const INGEST_ITEM_IDENTIFIER_KEY = "ingestSourceIdentifier" as const;
export const MissingItemIdentifierError = new Error(
  "existing item with matching source identifier does not contain item identifier",
);
export const DuplicateItemIdentifierError = (identifier: string) =>
  new Error(`item identifier '${identifier}' is not unique`);

// TODO: handle provenance updates
export async function ingestSources(
  sources: IngestibleSource[],
  store: OrbitStore,
  opts: IngestOptions = DEFAULT_OPTIONS(),
): Promise<Event[]> {
  const ingestEvents = new Map<IngestibleItemIdentifier, TaskIngestEvent>();
  const deleteEvents = new Map<
    IngestibleItemIdentifier,
    TaskUpdateDeletedEvent
  >();
  const updateProvenanceEvents: TaskUpdateProvenanceEvent[] = [];

  // TODO: create a new query or extend the entity query such that
  // we can filter on only sources that would have used this ingester
  const query: DatabaseEntityQuery<Task> = {
    entityType: EntityType.Task,
  };
  const entities = (await store.database.listEntities(query)).filter(
    // Ignore tasks which are deleted. This means that if you add the prompt back, it'll end up creating a new Task in the database. In the future we should consider just marking the deleted task as undeleted in those cases, to preserve continuous review history.
    (e) => !e.isDeleted,
  );
  const existingGroupedEntities =
    groupEntitiesByProvenanceIdentifiers(entities);
  const timeMillis = opts.ingestDateMillis;

  for (const source of sources) {
    const existingEntities = existingGroupedEntities.get(source.identifier);
    const provenance = createProvenanceForSource(source);
    if (existingEntities) {
      // determine which tasks are new and which have been deleted
      const existingEntitiesByItemIdentifiers =
        mapEntitiesByItemIdentifier(existingEntities);
      const ingestibleItemsByItemIdentifiers =
        mapIngestibleItemsByItemIdentifier(source.items);

      // determine which tasks are newly added
      for (const [key, potentialNewItem] of ingestibleItemsByItemIdentifiers) {
        const existingEntity = existingEntitiesByItemIdentifiers.get(key);
        if (existingEntity) {
          // task exists
          if (!isEqual(provenance, existingEntity.provenance)) {
            // task has been updated
            updateProvenanceEvents.push(
              createUpdateProvenanceEvent(
                existingEntity.id,
                timeMillis,
                provenance,
              ),
            );
          }
        } else {
          // task is new
          ingestEvents.set(
            key,
            createIngestTaskForSource(source, timeMillis)(potentialNewItem),
          );
        }
      }

      // determine which task have been deleted
      for (const [key, existingTask] of existingEntitiesByItemIdentifiers) {
        if (!ingestibleItemsByItemIdentifiers.get(key)) {
          // task has been deleted within the source
          deleteEvents.set(
            key,
            createDeleteTaskEvent(existingTask, timeMillis),
          );
        }
      }
    } else {
      // completely new source, ingest each item as a new task
      for (const item of source.items) {
        const ingestEvent = createIngestTaskForSource(source, timeMillis)(item);
        ingestEvents.set(item.identifier, ingestEvent);
      }
    }
  }

  // check if the inserts / deletes are really just moves
  for (const [ingestedEventItemIdentifier, ingestEvent] of ingestEvents) {
    const deleteEvent = deleteEvents.get(ingestedEventItemIdentifier);
    if (deleteEvent) {
      // item identifier is in both the ingest and delete map, must be a move:
      // delete the old events and generate an update provenance event instead
      deleteEvents.delete(ingestedEventItemIdentifier);
      ingestEvents.delete(ingestedEventItemIdentifier);
      if (!ingestEvent.provenance) {
        throw new Error("all ingest tasks should have provenance");
      }
      updateProvenanceEvents.push(
        createUpdateProvenanceEvent(
          deleteEvent.entityID,
          ingestEvent.timestampMillis,
          ingestEvent.provenance,
        ),
      );
    }
  }

  // TS compiler quirk: must declare a variable with the proper type annotation instead of just
  // defining an empty array inline
  const events: Event[] = [];
  return events.concat(
    Array.from(ingestEvents.values()),
    Array.from(deleteEvents.values()),
    updateProvenanceEvents,
  );
}

function groupEntitiesByProvenanceIdentifiers(entities: Task<TaskContent>[]) {
  const mapping = new Map<TaskProvenance["identifier"], Task<TaskContent>[]>();
  for (const entity of entities) {
    const provenance = entity.provenance;
    if (!provenance) continue;

    const existing = mapping.get(provenance.identifier);
    if (existing) {
      mapping.set(provenance.identifier, [...existing, entity]);
    } else {
      mapping.set(provenance.identifier, [entity]);
    }
  }
  return mapping;
}

function mapEntitiesByItemIdentifier(entities: Task<TaskContent>[]) {
  const mapping = new Map<IngestibleItemIdentifier, Task<TaskContent>>();
  for (const entity of entities) {
    const itemID = entity.metadata[INGEST_ITEM_IDENTIFIER_KEY];
    if (itemID) {
      mapping.set(itemID as IngestibleItemIdentifier, entity);
    } else {
      throw MissingItemIdentifierError;
    }
  }
  return mapping;
}

function mapIngestibleItemsByItemIdentifier(items: IngestibleItem[]) {
  const mapping = new Map<IngestibleItemIdentifier, IngestibleItem>();
  for (const item of items) {
    if (!mapping.get(item.identifier)) {
      mapping.set(item.identifier, item);
    } else {
      throw DuplicateItemIdentifierError(item.identifier);
    }
  }
  return mapping;
}

function createProvenanceForSource(source: IngestibleSource) {
  const provenance: TaskProvenance = {
    identifier: source.identifier,
    title: source.title,
    ...(source.url ? { url: source.url } : {}),
    ...(source.colorPaletteName
      ? { colorPaletteName: source.colorPaletteName }
      : {}),
  };
  return provenance;
}

function createIngestTaskForSource(
  source: IngestibleSource,
  insertTimestampMilis: number,
): (item: IngestibleItem) => TaskIngestEvent {
  const provenance = createProvenanceForSource(source);
  return (item) => {
    return {
      id: generateUniqueID(),
      type: EventType.TaskIngest,
      spec: item.spec,
      entityID: generateUniqueID(),
      timestampMillis: insertTimestampMilis,
      metadata: {
        [INGEST_ITEM_IDENTIFIER_KEY]: item.identifier,
      },
      provenance: {
        ...provenance,
      },
    };
  };
}

function createDeleteTaskEvent(
  task: Task<TaskContent>,
  timestampMillis: number,
): TaskUpdateDeletedEvent {
  return {
    type: EventType.TaskUpdateDeleted,
    id: generateUniqueID(),
    entityID: task.id,
    timestampMillis,
    isDeleted: true,
  };
}

function createUpdateProvenanceEvent(
  originalEntityId: TaskID,
  timestampMillis: number,
  provenance: TaskProvenance,
): TaskUpdateProvenanceEvent {
  return {
    type: EventType.TaskUpdateProvenanceEvent,
    id: generateUniqueID(),
    entityID: originalEntityId,
    timestampMillis,
    provenance,
  };
}
