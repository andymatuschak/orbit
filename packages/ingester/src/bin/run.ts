import OrbitStoreFS from "@withorbit/store-fs";
import { ingestSources } from "../ingest";

(async () => {
  const orbitStorePath = process.argv[2];
  // const noteDirectory = process.argv[3];
  if (!orbitStorePath) {
    console.error("yarn ingest /path/to/orbit-store");
    process.exit(0);
  }

  // TODO: temporary, move this CLI to a new package
  const orbitStore = new OrbitStoreFS(orbitStorePath);
  await ingestSources([], orbitStore);
})()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
