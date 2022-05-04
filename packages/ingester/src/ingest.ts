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
  ingestDateMilis: number;
};
const DEFAULT_OPTIONS = (): IngestOptions => ({
  ingestDateMilis: Date.now(),
});

export const INGEST_ITEM_IDENTIFIER_KEY = "ingest_item_identifier" as const;

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
  const groupedEntities = groupEntitiesByProvenanceIdentifiers(entities);
  const timeMillis = opts.ingestDateMilis;

  for (const source of sources) {
    if (groupedEntities[source.identifier]) {
      // determine which prompts are new and which have been deleted
      const existingPrompts = mapEntitiesByItemIdentifiers(
        groupedEntities[source.identifier],
      );
      const newPrompts = mapIngestibleItemsByItemIdentifiers(source.items);

      // determine which tasks are newly added
      for (const [key, potentialNewPrompt] of Object.entries(newPrompts)) {
        if (!existingPrompts[key as IngestibleItemIdentifier]) {
          // task is new
          events.push(
            createIngestTaskForSource(source, timeMillis)(potentialNewPrompt),
          );
        }
      }

      // determine which task have been deleted
      for (const [key, existingPrompt] of Object.entries(existingPrompts)) {
        if (!newPrompts[key as IngestibleItemIdentifier]) {
          // task has been deleted within
          // TODO: before marking as deleted, check if this ID is a new ingest event
          // for another. If so, convert event to be a provenance update.
          events.push(createDeletePromptEvent(existingPrompt, timeMillis));
        }
      }
    } else {
      // completely new source, ingest each prompt
      const ingestEvents = source.items.map(
        createIngestTaskForSource(source, timeMillis),
      );
      events.push(...ingestEvents);
    }
  }
  return events;
}

function groupEntitiesByProvenanceIdentifiers(entities: Task<TaskContent>[]) {
  const mapping: Record<TaskProvenance["identifier"], Task<TaskContent>[]> = {};
  for (const entity of entities) {
    const provenance = entity.provenance;
    if (!provenance) continue;

    if (mapping[provenance.identifier]) {
      mapping[provenance.identifier].push(entity);
    } else {
      mapping[provenance.identifier] = [entity];
    }
  }
  return mapping;
}

function mapEntitiesByItemIdentifiers(entities: Task<TaskContent>[]) {
  // [01/05/22]: our current versin of typescript does not allow
  // `IngestibleItemIdentifier` to be the key of an object. Newer
  // releases of typescript support this behavior.
  // https://github.com/microsoft/TypeScript/pull/44512
  const mapping: Record<string, Task<TaskContent>> = {};
  for (const entity of entities) {
    const itemID = entity.metadata[INGEST_ITEM_IDENTIFIER_KEY];
    mapping[itemID] = entity;
  }
  return mapping;
}

function mapIngestibleItemsByItemIdentifiers(items: IngestibleItem[]) {
  const mapping: Record<string, IngestibleItem> = {};
  for (const item of items) {
    mapping[item.identifier] = item;
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

function createDeletePromptEvent(
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
