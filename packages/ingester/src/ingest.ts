import {
  EntityType,
  Event,
  EventType,
  generateUniqueID,
  Task,
  TaskContent,
  TaskIngestEvent,
  TaskProvenance,
  TaskUpdateDeletedEvent,
} from "@withorbit/core";
import { DatabaseEntityQuery, OrbitStore } from "@withorbit/store-shared";
import {
  IngestibleItem,
  IngestibleItemIdentifier,
  IngestibleSource,
} from "./ingestible";

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

// TODO: handle moves across sources
// TODO: handle provenance updates
export async function ingestSources(
  sources: IngestibleSource[],
  store: OrbitStore,
  opts: IngestOptions = DEFAULT_OPTIONS(),
) {
  const events: Event[] = [];

  // TODO: create a new query or extend the entity query such that
  // we can filter on only sources that would have used this ingester
  const query: DatabaseEntityQuery<Task> = {
    entityType: EntityType.Task,
  };
  const entities = await store.database.listEntities(query);
  const existingGroupedEntities =
    groupEntitiesByProvenanceIdentifiers(entities);
  const timeMillis = opts.ingestDateMillis;

  for (const source of sources) {
    const existingEntity = existingGroupedEntities.get(source.identifier);
    if (existingEntity) {
      // determine which tasks are new and which have been deleted
      const existingEntitiesByItemIdentifiers =
        mapEntitiesByItemIdentifier(existingEntity);
      const ingestibleItemsByItemIdentifiers =
        mapIngestibleItemsByItemIdentifier(source.items);

      // determine which tasks are newly added
      for (const [key, potentialNewItem] of ingestibleItemsByItemIdentifiers) {
        if (!existingEntitiesByItemIdentifiers.get(key)) {
          // task is new
          events.push(
            createIngestTaskForSource(source, timeMillis)(potentialNewItem),
          );
        }
      }

      // determine which task have been deleted
      for (const [key, existingTask] of existingEntitiesByItemIdentifiers) {
        if (!ingestibleItemsByItemIdentifiers.get(key)) {
          // task has been deleted within
          // TODO: before marking as deleted, check if this ID is a new ingest event
          // for another. If so, convert event to be a provenance update.
          events.push(createDeleteTaskEvent(existingTask, timeMillis));
        }
      }
    } else {
      // completely new source, ingest each item as a new task
      const ingestEvents = source.items.map(
        createIngestTaskForSource(source, timeMillis),
      );
      events.push(...ingestEvents);
    }
  }
  return events;
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

function createIngestTaskForSource(
  source: IngestibleSource,
  insertTimestampMilis: number,
): (item: IngestibleItem) => TaskIngestEvent {
  const provenance: TaskProvenance = {
    identifier: source.identifier,
    title: source.title,
    ...(source.url ? { url: source.url } : {}),
    ...(source.colorPaletteName
      ? { colorPaletteName: source.colorPaletteName }
      : {}),
  };
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
