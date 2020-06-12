import levelup from "levelup";
import leveldown from "leveldown";
import path from "path";

import * as IT from "incremental-thinking";
import {
  getDefaultFirebaseApp,
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import { taskCache, notePrompts } from "spaced-everything";
import SpacedEverythingImportCache from "./importCache";
import { createTaskCache } from "./taskCache";

(async () => {
  const app = getDefaultFirebaseApp();
  const userClient = new MetabookFirebaseUserClient(
    app.firestore(),
    "VkPiAU6PVGgR20iLlyekhun8BU03",
  );
  const dataClient = new MetabookFirebaseDataClient(
    app.firestore(),
    app.functions(),
  );

  const importCache = new SpacedEverythingImportCache(
    levelup(leveldown("cache.db")),
  );

  const noteDirectory = process.argv[2];
  const noteFilenames = await IT.listNoteFiles(noteDirectory);
  console.log(`Found ${noteFilenames.length} notes in ${noteDirectory}`);
  const noteTaskSource = notePrompts.createTaskSource(
    noteFilenames.map((filename) => path.join(noteDirectory, filename)),
  );
  const orbitTaskSink = createTaskCache(userClient, dataClient, importCache);

  await taskCache.updateTaskCache(orbitTaskSink, noteTaskSource);

  await importCache.close();
})()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
