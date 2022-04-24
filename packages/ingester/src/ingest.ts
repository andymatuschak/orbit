import {
  EntityType,
  Event,
  EventType,
  generateUniqueID,
  QATaskContent,
  Task,
  TaskContent,
  TaskContentType,
  TaskIngestEvent,
  TaskProvenance,
  TaskSpecType,
  TaskUpdateDeletedEvent,
} from "@withorbit/core";
import { DatabaseEntityQuery, OrbitStore } from "@withorbit/store-shared";
import { IngestiblePrompt, IngestibleSource } from "./ingestible";

// TODO: handle moves across sources
// TODO: handle provenance updates
export async function ingestSources(
  sources: IngestibleSource[],
  store: OrbitStore,
) {
  const events: Event[] = [];

  // TODO: create a new query or extend the entity query such that
  // we can filter on only sources that would have used this ingester
  const query: DatabaseEntityQuery<Task> = {
    entityType: EntityType.Task,
  };
  const entities = await store.database.listEntities(query);
  const groupedEntities = groupEntitiesByIdentifiers(entities);
  const timeMillis = Date.now();

  for (const source of sources) {
    if (groupedEntities[source.identifier]) {
      // determine which prompts are new and which have been deleted
      const existingPrompts = [...groupedEntities[source.identifier]];

      for (const prompt of source.prompts) {
        // NOTE: this `findIndex` is a bit expensive since it scans of each iteration.
        // If this becomes a bottleneck we should precompute a hash for each task prompt.
        const existingPromptIndex = existingPrompts.findIndex(
          isOrbitTaskEqualToPrompt(prompt),
        );
        if (existingPromptIndex !== -1) {
          // prompt already exists, remove from existing prompt search
          existingPrompts.splice(existingPromptIndex, 1);
        } else {
          // prompt does not exist, lets ingest
          events.push(createIngestTaskForSource(source, timeMillis)(prompt));
        }
      }

      // mark all the prompts that still exist as deleted...
      for (const existingPrompt of existingPrompts) {
        events.push(createDeletePromptEvent(existingPrompt, timeMillis));
      }
    } else {
      // completely new source, ingest each prompt
      const ingestEvents = source.prompts.map(
        createIngestTaskForSource(source, timeMillis),
      );
      events.push(...ingestEvents);
    }
  }
  return events;
}

function groupEntitiesByIdentifiers(entities: Task<TaskContent>[]) {
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

function createIngestTaskForSource(
  source: IngestibleSource,
  insertTimestampMilis: number,
): (prompt: IngestiblePrompt) => TaskIngestEvent {
  const provenance: TaskProvenance = {
    identifier: source.identifier,
    // TODO: we should allow prompts to specify an optional title. If
    // they do, then we set this title to be the containerTitle
    title: source.title,
    ...(source.url ? { url: source.url } : {}),
    ...(source.colorPaletteName
      ? { colorPaletteName: source.colorPaletteName }
      : {}),
  };
  return (prompt) => {
    const content: QATaskContent = {
      type: TaskContentType.QA,
      body: {
        text: prompt.body.text,
        attachments: [],
      },
      answer: {
        text: prompt.answer.text,
        attachments: [],
      },
    };
    return {
      id: generateUniqueID(),
      type: EventType.TaskIngest,
      spec: {
        type: TaskSpecType.Memory,
        content,
      },
      // TODO: allow the interpreter to provide a stable identifier alongside prompts
      // use random generation as a fallback. This will allow us to track moves across sources.
      entityID: generateUniqueID(),
      timestampMillis: insertTimestampMilis,
      provenance,
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

function isOrbitTaskEqualToPrompt(
  prompt: IngestiblePrompt,
): (task: Task<TaskContent>) => boolean | undefined {
  return (task) => {
    if (task.spec.content.type === TaskContentType.QA && prompt.type === "qa") {
      // they both are QA prompts, do they have the same content?
      const taskContent = task.spec.content;
      return (
        taskContent.body.text === prompt.body.text &&
        taskContent.answer.text === prompt.answer.text
      );
    }
    return false;
  };
}
