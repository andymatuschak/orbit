import {
  EntityType,
  EventType,
  generateUniqueID,
  Task,
  TaskUpdateMetadataEvent,
} from "@withorbit/core";
import { CryptoBase64Hasher } from "@withorbit/interpreter/dist/hasher/CryptoBase64Hasher";
import OrbitStoreFS from "@withorbit/store-fs";
import { INGEST_ITEM_IDENTIFIER_KEY } from "../ingest.js";

async function run(config: { orbitStorePath: string }) {
  const orbitStore = new OrbitStoreFS(config.orbitStorePath);
  const migrationEvents: TaskUpdateMetadataEvent[] = [];
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
          const ingestID = CryptoBase64Hasher.hash(task.spec);
          migrationEvents.push({
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

    console.log(`Migrating ${migrationEvents.length} tasks.`);
    await orbitStore.database.putEvents(migrationEvents);
  } finally {
    await orbitStore.close();
  }
}

(async () => {
  // ensure that the arguments are defined
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
