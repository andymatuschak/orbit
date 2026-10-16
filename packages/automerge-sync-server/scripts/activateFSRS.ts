import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  Repo,
  parseAutomergeUrl,
  type AutomergeUrl,
} from "@automerge/automerge-repo";
import {
  type AutomergeDocumentURL,
  type FSRSSchedulerPolicy,
  validateFSRSSchedulerPolicy,
} from "@withorbit/core";
import { RepoPerTaskDocuments } from "@withorbit/store-automerge";
import { decodePerTaskVaultRoot } from "@withorbit/store-shared/perTaskCodec";
import {
  defaultLabConfigurationPath,
  loadLabConfiguration,
} from "../src/config.js";
import { AtomicNodeFSStorageAdapter } from "../src/storage/atomicNodeFSStorageAdapter.js";
import { acquireWriterLock } from "../src/storage/storageMetadata.js";
import { snapshotLab } from "./labSnapshot.js";

/** One-time private experiment. Stop the writer and upgrade readers first. */
export async function activateFSRS(input: {
  configurationPath: string;
  weights: number[];
  snapshotDestination: string;
  cutoverTimestampMillis: number;
  requestedRetention?: number;
}) {
  const configuration = await loadLabConfiguration(input.configurationPath);
  // The existing snapshot operation refuses an active writer or existing
  // destination. Keep a complete recoverable vault before touching its policy.
  const backup = await snapshotLab({
    configurationPath: input.configurationPath,
    destination: input.snapshotDestination,
  });
  const release = await acquireWriterLock(configuration.storageRoot);
  const storage = new AtomicNodeFSStorageAdapter(configuration.storageRoot);
  let repo: Repo | undefined;
  let documents: RepoPerTaskDocuments | undefined;
  try {
    repo = new Repo({ storage, network: [] });
    documents = new RepoPerTaskDocuments(repo);
    const url = configuration.rootDocumentURL as AutomergeDocumentURL;
    const before = await documents.read(url, { localOnly: true });
    if (!before) throw new Error("Configured root is missing");
    const root = decodePerTaskVaultRoot(before.data);
    if (root.scheduler.kind !== "orbit-sm2-like")
      throw new Error("FSRS activation requires the original Orbit policy");
    const policy: FSRSSchedulerPolicy = {
      kind: "fsrs",
      version: 1,
      modelVersion: 6,
      weights: [...input.weights],
      requestedRetention: input.requestedRetention ?? 0.9,
      cutoverTimestampMillis: input.cutoverTimestampMillis,
      previousPolicy: root.scheduler,
    };
    validateFSRSSchedulerPolicy(policy);
    await documents.patch(url, [
      { kind: "put", path: ["scheduler"], value: policy },
    ]);
    await repo.flush([
      parseAutomergeUrl(url as unknown as AutomergeUrl).documentId,
    ]);
    const after = decodePerTaskVaultRoot((await documents.read(url))!.data);
    if (
      JSON.stringify({ ...after, scheduler: root.scheduler }) !==
      JSON.stringify(root)
    )
      throw new Error(
        "Scheduler activation unexpectedly changed other root fields",
      );
    if (JSON.stringify(after.scheduler) !== JSON.stringify(policy))
      throw new Error("Persisted scheduler differs from the requested policy");
    return {
      rootDocumentURL: url,
      vaultID: root.vaultID,
      snapshotConfigurationPath: backup.configurationPath,
      cutoverTimestampMillis: policy.cutoverTimestampMillis,
      requestedRetention: policy.requestedRetention,
      modelVersion: policy.modelVersion,
      weightsSHA256: createHash("sha256")
        .update(JSON.stringify(policy.weights))
        .digest("hex"),
      rootOnly: true,
    };
  } finally {
    try {
      await documents?.close();
      await repo?.shutdown();
    } finally {
      await storage.close();
      await release();
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { values } = parseArgs({
    options: {
      config: { type: "string", default: defaultLabConfigurationPath },
      weights: { type: "string" },
      snapshot: { type: "string" },
      cutover: { type: "string" },
      retention: { type: "string", default: "0.9" },
    },
  });
  if (!values.weights || !values.snapshot)
    throw new Error(
      "Stop the writer first, then pass --weights <private JSON array> --snapshot <new private directory>; upgrade all readers before activation",
    );
  const weights = JSON.parse(await fs.readFile(values.weights, "utf8"));
  console.info(
    JSON.stringify(
      await activateFSRS({
        configurationPath: values.config,
        weights,
        snapshotDestination: values.snapshot,
        cutoverTimestampMillis: values.cutover
          ? Number(values.cutover)
          : Date.now(),
        requestedRetention: Number(values.retention),
      }),
    ),
  );
}
