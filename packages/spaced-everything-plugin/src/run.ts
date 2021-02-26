import levelup from "levelup";
import leveldown from "leveldown";
import path from "path";

import IT from "incremental-thinking";
import { UserClient } from "metabook-client";
import spacedEverything from "spaced-everything";
import SpacedEverythingImportCache from "./importCache";
import { createTaskCache } from "./taskCache";

(async () => {
  const importCache = new SpacedEverythingImportCache(
    levelup(leveldown("cache.db")),
  );

  const noteDirectory = process.argv[2];
  const noteFilenames = await IT.listNoteFiles(noteDirectory);
  console.log(`Found ${noteFilenames.length} notes in ${noteDirectory}`);
  const noteTaskSource = spacedEverything.notePrompts.createTaskSource(
    noteFilenames.map((filename) => path.join(noteDirectory, filename)),
  );

  const userClient = new UserClient(
    async () => ({
      personalAccessToken: "q6qA8bZE7Nya8h10JzNF",
    }),
    { baseURL: "http://localhost:5001/metabook-system/us-central1/api" },
  );
  const orbitTaskSink = createTaskCache(userClient, importCache);

  await spacedEverything.taskCache.updateTaskCache(
    orbitTaskSink,
    noteTaskSource,
  );

  await importCache.close();
})()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
