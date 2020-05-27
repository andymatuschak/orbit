import levelup from "levelup";
import leveldown from "leveldown";

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
    "x5EWk2UT56URxbfrl7djoxwxiqH2",
  );
  const dataClient = new MetabookFirebaseDataClient(
    app.firestore(),
    app.functions(),
  );

  const importCache = new SpacedEverythingImportCache(
    levelup(leveldown("cache.db")),
  );

  const noteTaskSource = notePrompts.createTaskSource(process.argv);
  const orbitTaskSink = createTaskCache(userClient, dataClient, importCache);

  await taskCache.updateTaskCache(orbitTaskSink, noteTaskSource);

  await importCache.close();
})()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
