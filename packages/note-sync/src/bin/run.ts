import levelup from "levelup";
import leveldown from "leveldown";
import path from "path";

import * as IT from "incremental-thinking";
import OrbitAPIClient, {
  defaultAPIConfig,
  emulatorAPIConfig,
  APIConfig,
} from "@withorbit/api-client";
import * as spacedEverything from "spaced-everything";
import SpacedEverythingImportCache from "../importCache";
import { createTaskCache } from "../taskCache";

async function sync(
  noteDirectory: string,
  personalAccessToken: string,
  apiConfig: APIConfig,
) {
  const noteFilenames = await IT.listNoteFiles(noteDirectory);
  console.log(`Found ${noteFilenames.length} notes in ${noteDirectory}`);
  const noteTaskSource = spacedEverything.notePrompts.createTaskSource(
    noteFilenames.map((filename) => path.join(noteDirectory, filename)),
  );

  const apiClient = new OrbitAPIClient(
    async () => ({
      personalAccessToken,
    }),
    apiConfig,
  );
  const importCache = new SpacedEverythingImportCache(
    levelup(leveldown("cache.db")),
  );
  const orbitTaskSink = createTaskCache(apiClient, importCache);

  await spacedEverything.taskCache.updateTaskCache(
    orbitTaskSink,
    noteTaskSource,
  );

  await importCache.close();
}

(async () => {
  const noteDirectory = process.argv[2];
  if (!noteDirectory) {
    console.error("Must provide note directory path");
    process.exit(0);
  }

  const personalAccessToken = process.env["ORBIT_TOKEN"];
  if (!personalAccessToken) {
    console.error(
      "Must provide personal access token via TOKEN environment variable",
    );
    process.exit(0);
  }

  const apiConfig =
    process.env["ORBIT_ENV"] && process.env["ORBIT_ENV"] === "production"
      ? defaultAPIConfig
      : emulatorAPIConfig;
  await sync(noteDirectory, personalAccessToken, apiConfig);
})()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
