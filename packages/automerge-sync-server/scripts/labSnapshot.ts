import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadLabConfiguration } from "../src/config.js";
import { acquireWriterLock } from "../src/storage/storageMetadata.js";
import { assertOutsideGit } from "./labSeed.js";

/** Stop the server first. The same lock prevents it restarting halfway through a copy. */
export async function snapshotLab(input: {
  configurationPath: string;
  destination: string;
}) {
  const configuration = await loadLabConfiguration(input.configurationPath);
  const raw = JSON.parse(await fs.readFile(input.configurationPath, "utf8"));
  const destination = await assertOutsideGit(path.resolve(input.destination));
  if (
    destination.startsWith(
      (await fs.realpath(configuration.storageRoot)) + path.sep,
    )
  )
    throw new Error("Snapshot cannot be inside its source Repo");
  const release = await acquireWriterLock(configuration.storageRoot);
  try {
    return await copyPrivateVault(configuration.storageRoot, raw, destination);
  } finally {
    await release();
  }
}

/** Restoring always creates a new directory; switching the running process is deliberately separate. */
export async function restoreLab(input: {
  snapshot: string;
  destination: string;
}) {
  const snapshot = await fs.realpath(input.snapshot);
  const configurationPath = path.join(snapshot, "config.json");
  await loadLabConfiguration(configurationPath);
  const raw = JSON.parse(await fs.readFile(configurationPath, "utf8"));
  const destination = await assertOutsideGit(path.resolve(input.destination));
  if (destination.startsWith(snapshot + path.sep))
    throw new Error("Restore cannot be inside its snapshot");
  const repo = path.join(snapshot, "repo");
  const release = await acquireWriterLock(repo);
  try {
    return await copyPrivateVault(repo, raw, destination);
  } finally {
    await release();
  }
}

async function copyPrivateVault(
  source: string,
  raw: Record<string, unknown>,
  destination: string,
) {
  await fs.mkdir(destination, { mode: 0o700 });
  const storageRoot = path.join(destination, "repo");
  await fs.cp(source, storageRoot, {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter: (filename) => path.basename(filename) !== ".writer-lock",
  });
  // Write configuration last: incomplete copies have no usable configuration to publish.
  const configurationPath = path.join(destination, "config.json");
  const file = await fs.open(configurationPath, "wx", 0o600);
  try {
    await file.writeFile(
      JSON.stringify(
        { ...raw, storageRoot, updatesRoot: path.join(destination, "updates") },
        null,
        2,
      ),
    );
    await file.sync();
  } finally {
    await file.close();
  }
  return {
    configurationPath,
    storageRoot,
    rootDocumentURL: raw.rootDocumentURL,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [action, flag, source, destinationFlag, destination] =
    process.argv.slice(2);
  if (
    destinationFlag !== "--destination" ||
    !source ||
    !destination ||
    process.argv.length !== 7
  )
    throw new Error(
      "Expected snapshot --config <private config> --destination <new directory>, or restore --snapshot <directory> --destination <new directory>",
    );
  const receipt =
    action === "snapshot" && flag === "--config"
      ? await snapshotLab({ configurationPath: source, destination })
      : action === "restore" && flag === "--snapshot"
        ? await restoreLab({ snapshot: source, destination })
        : (() => {
            throw new Error("Unknown snapshot/restore operation");
          })();
  console.info(JSON.stringify(receipt));
}
