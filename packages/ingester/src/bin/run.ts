import OrbitStoreFS from "@withorbit/store-fs";
import fs from "fs";
import { ingestSources } from "../ingest.js";
import { Ingestible } from "../ingestible.js";
import { createIngestibleValidator } from "../validateIngestible.js";

async function run(config: { ingestible: Ingestible; orbitStorePath: string }) {
  const orbitStore = new OrbitStoreFS(config.orbitStorePath);
  try {
    const events = await ingestSources(config.ingestible.sources, orbitStore);
    console.log(events);
    await orbitStore.database.putEvents(events);
  } finally {
    orbitStore.close();
  }
}

const validator = createIngestibleValidator({ mutateWithDefaultValues: true });

(async () => {
  // ensure that the arguments are defined
  const orbitStorePath = process.argv[2];
  const jsonFilePath = process.argv[3];
  if (!orbitStorePath || !jsonFilePath) {
    console.error(
      "Usage: bun run ingest /path/to/orbit-store /path/to/json-file",
    );
    process.exit(1);
  }

  // validate that the JSON file exists and is valid
  let ingestibleJson: unknown;
  try {
    if (fs.existsSync(jsonFilePath)) {
      ingestibleJson = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));
    } else {
      console.error(`File does not exist at path: ${jsonFilePath}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
  const { isValid, errors } = validator.validate(ingestibleJson);
  if (!isValid) {
    console.error(`Cannot ingest file at ${jsonFilePath}`);
    console.error(errors);
    process.exit(1);
  }
  // begin ingestion
  const ingestible = ingestibleJson as Ingestible;
  await run({ ingestible, orbitStorePath });
})()
  .then(() => {
    process.exit(0);
  })
  .catch(console.error);
