import OrbitStoreFS from "@withorbit/store-fs";
import path from "path";

import * as IT from "incremental-thinking";
import * as spacedEverything from "spaced-everything";
import { createImportCache, createTaskCache } from "../taskCache";

async function updateStore(noteDirectory: string, orbitStorePath: string) {
  const noteFilenames = await IT.listNoteFiles(noteDirectory);
  console.log(`Found ${noteFilenames.length} notes in ${noteDirectory}`);
  const noteTaskSource = spacedEverything.notePrompts.createTaskSource(
    noteFilenames.map((filename) => path.join(noteDirectory, filename)),
  );

  const orbitStore = await OrbitStoreFS.open(orbitStorePath, true);
  const importCache = await createImportCache(orbitStore.database);
  const orbitTaskSink = createTaskCache(importCache, orbitStore.database);

  await spacedEverything.taskCache.updateTaskCache(
    orbitTaskSink,
    noteTaskSource,
  );

  await orbitStore.close();
}

(async () => {
  const orbitStorePath = process.argv[2];
  const noteDirectory = process.argv[3];
  if (!orbitStorePath || !noteDirectory) {
    console.error(
      "Usage: run.ts someLocalOrbitStore.orbitStore pathToMarkdownFiles",
    );
    process.exit(0);
  }

  if (!noteDirectory) {
    console.error("Must provide note directory path");
    process.exit(0);
  }

  await updateStore(noteDirectory, orbitStorePath);
})()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
