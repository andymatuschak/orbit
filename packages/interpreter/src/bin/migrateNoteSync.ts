import {
  EntityType,
  Event,
  EventType,
  generateUniqueID,
  Task,
  TaskContentType,
  TaskSpec,
  TaskSpecType,
} from "@withorbit/core";
import { INGEST_ITEM_IDENTIFIER_KEY } from "@withorbit/ingester";
import OrbitStoreFS from "@withorbit/store-fs";
import { CryptoBase64Hasher } from "../hasher/CryptoBase64Hasher.js";
import { processor } from "../interpreters/markdown/markdown.js";

async function normalizeTaskContentFieldBody(text: string): Promise<string> {
  return (await processor.process(text)).toString().trimEnd();
}

// note-sync uses a slightly different Markdown processor than interpreter does. interpreter parses LaTeX appropriately, so it doesn't escape "unsafe" characters inside of inline math, as note-sync's processor did. interpreter uses the latest micromark, which fixes some escaping bugs. And so we run the text associated with note-sync's prompts through the new processor to normalize it. In some cases, this won't be enough, and migration will end up resetting review stats associated with the task. But in my library (thousands of tasks), this happened only about ten times.
async function normalizeTaskSpecIfNecessary(
  spec: TaskSpec,
): Promise<TaskSpec | null> {
  switch (spec.type) {
    case TaskSpecType.Memory: {
      const { content } = spec;
      switch (content.type) {
        case TaskContentType.QA:
          const front = await normalizeTaskContentFieldBody(content.body.text);
          const back = await normalizeTaskContentFieldBody(content.answer.text);
          if (front !== content.body.text || back !== content.answer.text) {
            return {
              ...spec,
              content: {
                ...content,
                body: { ...content.body, text: front },
                answer: { ...content.answer, text: back },
              },
            };
          } else {
            return null;
          }
        case TaskContentType.Cloze:
        case TaskContentType.Plain:
          const normalized = await normalizeTaskContentFieldBody(
            content.body.text,
          );
          if (normalized !== content.body.text) {
            return {
              ...spec,
              content: {
                ...content,
                body: { ...content.body, text: normalized },
              },
            };
          } else {
            return null;
          }
      }
    }
  }
}

async function run(config: { orbitStorePath: string }) {
  const orbitStore = new OrbitStoreFS(config.orbitStorePath);
  const events: Event[] = [];
  try {
    let afterID = undefined;
    let tasks: Task[];

    do {
      tasks = await orbitStore.database.listEntities<Task>({
        afterID,
        entityType: EntityType.Task,
      });
      afterID = tasks.at(-1)?.id;

      for (const task of tasks) {
        if (
          !task.isDeleted &&
          task.provenance?.url?.startsWith("bear://") &&
          !task.metadata[INGEST_ITEM_IDENTIFIER_KEY]
        ) {
          // Update the task content for the new parser if necessary.
          const normalizedSpec = await normalizeTaskSpecIfNecessary(task.spec);
          if (normalizedSpec) {
            console.log("Update:", task.spec.content, normalizedSpec.content);
            events.push({
              type: EventType.TaskUpdateSpecEvent,
              id: generateUniqueID(),
              timestampMillis: Date.now(),
              entityID: task.id,
              spec: normalizedSpec,
            });
          }

          // Add a new ingester-compatible ID so that review history continues properly.
          const ingestID = CryptoBase64Hasher.hash(normalizedSpec ?? task.spec);
          events.push({
            type: EventType.TaskUpdateMetadataEvent,
            id: generateUniqueID(),
            timestampMillis: Date.now(),
            entityID: task.id,
            metadata: {
              [INGEST_ITEM_IDENTIFIER_KEY]: ingestID,
            },
          });
        }
      }
    } while (tasks?.length > 0);
    console.log(
      `Updating ${new Set(events.map((e) => e.entityID)).size} tasks`,
    );
    await orbitStore.database.putEvents(events);
  } finally {
    await orbitStore.close();
  }
}

(async () => {
  const orbitStorePath = process.argv[2];
  if (!orbitStorePath) {
    console.error("Usage: bun src/bin/migrateNoteSync.ts /path/to/orbit-store");
    process.exit(1);
  }

  await run({ orbitStorePath });
})()
  .then(() => {
    process.exit(0);
  })
  .catch(console.error);
