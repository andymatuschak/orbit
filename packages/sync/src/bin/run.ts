import OrbitAPIClient, {
  defaultAPIConfig,
  emulatorAPIConfig,
} from "@withorbit/api-client";
import OrbitStoreFS from "@withorbit/store-fs";
import { APISyncAdapter } from "../APISyncAdapter.js";
import { syncOrbitStore } from "../sync.js";

(async () => {
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

  const orbitStorePath = process.argv[2];
  if (!orbitStorePath) {
    console.error(
      "Usage: ORBIT_TOKEN=your_personal_access_token ORBIT_ENV=[development/production] bun run sync pathToLocalStore.orbitStore",
    );
    process.exit(0);
  }

  const apiClient = new OrbitAPIClient(
    async () => ({ personalAccessToken }),
    apiConfig,
  );
  const apiAdapter = new APISyncAdapter(apiClient, "remote");
  const localStore = new OrbitStoreFS(orbitStorePath);

  await syncOrbitStore({
    source: localStore,
    destination: apiAdapter,
    sendBatchSize: 200,
    receiveBatchSize: 5000,
  });
  await localStore.close();
  process.exit(0);
})()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
