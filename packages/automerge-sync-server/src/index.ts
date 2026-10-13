import { pathToFileURL } from "node:url";
import { loadLabConfiguration } from "./config.js";
import { LabSyncService } from "./server.js";

export * from "./config.js";
export * from "./server.js";
export * from "./storage/storageMetadata.js";
export * from "./storage/atomicNodeFSStorageAdapter.js";

export async function startLabSyncProcess(configurationPath?: string) {
  const service = new LabSyncService(
    await loadLabConfiguration(configurationPath),
  );
  const address = await service.start();
  console.info(
    JSON.stringify({ event: "orbit_lab_started", port: address.port }),
  );
  const stop = () =>
    void service.shutdown().catch(() => {
      process.exitCode = 1;
    });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return service;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--config"))
    throw new Error("Expected --config <private-configuration-path>");
  await startLabSyncProcess(args[1]);
}
