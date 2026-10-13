import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  Repo,
  parseAutomergeUrl,
  type AutomergeUrl,
  type StorageId,
} from "@automerge/automerge-repo";
import {
  AtomicNodeFSStorageAdapter,
  acquireWriterLock,
  defaultLabConfigurationPath,
  ensureStorageID,
  loadLabConfiguration,
} from "@withorbit/automerge-sync-server";
import { RepoPerTaskDocuments } from "@withorbit/store-automerge";
import { AuthenticatedWebSocketNetworkAdapter } from "@withorbit/store-automerge/authenticatedWebSocketNetworkAdapter";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import type {
  AutomergeDocumentURL,
  VaultMutation,
  TaskID,
  VaultTask,
} from "@withorbit/core";
import { ingestSources } from "../ingest.js";
import type { Ingestible } from "../ingestible.js";
import { createIngestibleValidator } from "../validateIngestible.js";

export async function runIngest(input: {
  ingestible: Ingestible;
  configurationPath?: string;
  dryRun?: boolean;
  reportPath?: string;
}) {
  const configurationPath =
    input.configurationPath ??
    process.env.ORBIT_LAB_CONFIG ??
    defaultLabConfigurationPath;
  const configuration = await loadLabConfiguration(configurationPath);
  // This is an ordinary client, never a second writer in the live server Repo.
  const cache = path.join(
    path.dirname(path.resolve(configurationPath)),
    "ingester-repo",
  );
  if (path.resolve(cache) === path.resolve(configuration.storageRoot))
    throw new Error(
      "The importer cache must not be the server's storage directory",
    );
  const origin = `http://127.0.0.1:${configuration.port}`;
  const response = await fetch(`${origin}/v1/root`, {
    method: "POST",
    headers: { Authorization: `Bearer ${configuration.pairingToken}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(`Private vault bootstrap failed (${response.status})`);
  const remote = (await response.json()) as { rootDocumentURL?: string };
  if (remote.rootDocumentURL !== configuration.rootDocumentURL)
    throw new Error(
      "The running service does not match the configured private vault",
    );

  await fs.mkdir(cache, { recursive: true, mode: 0o700 });
  const unlock = await acquireWriterLock(cache);
  const storage = new AtomicNodeFSStorageAdapter(cache);
  const network = new AuthenticatedWebSocketNetworkAdapter(
    `${origin.replace("http:", "ws:")}/v1/sync`,
    async () => ({ kind: "pairedToken", token: configuration.pairingToken }),
  );
  let repo: Repo | undefined;
  let repository: PerTaskRepository | undefined;
  try {
    await ensureStorageID(storage);
    repo = new Repo({
      storage,
      network: [network],
      isEphemeral: false,
      enableRemoteHeadsGossiping: true,
      shareConfig: { announce: async () => true, access: async () => true },
    });
    await withTimeout(network.whenReady(), "Private sync admission timed out");
    const rootURL = configuration.rootDocumentURL as AutomergeDocumentURL;
    await waitForSync(repo, [rootURL], network.remoteStorageID!);
    const documents = new RepoPerTaskDocuments(repo);
    repository = await PerTaskRepository.open(documents, rootURL);
    await waitForSync(repo, [repository.catalogURL], network.remoteStorageID!);
    const entries = await repository.getCatalogEntries();
    // Reconcile current definitions, not stale client snapshots from last run.
    const tasks = new Map<TaskID, VaultTask>();
    const taskIDs = Object.keys(entries) as TaskID[];
    for (let start = 0; start < taskIDs.length; start += 64) {
      const ids = taskIDs.slice(start, start + 64);
      const urls = ids.map((id) => entries[id].documentURL);
      await waitForSync(repo, urls, network.remoteStorageID!);
      for (const [id, task] of await repository.getTaskDefinitions(ids))
        tasks.set(id, task);
      const documentIDs = urls.map(
        (url) => parseAutomergeUrl(url as unknown as AutomergeUrl).documentId,
      );
      await repo.flush(documentIDs);
      for (let i = 0; i < urls.length; i++) {
        documents.release(urls[i]);
        await repo.removeFromCache(documentIDs[i]);
      }
    }
    const mutations = ingestSources(input.ingestible.sources, tasks);
    const summary = summarizeMutations(mutations);
    if (input.reportPath) {
      // Reports can contain note content. Create explicitly private new files.
      await fs.writeFile(
        input.reportPath,
        JSON.stringify({ summary, mutations }),
        { flag: "wx", mode: 0o600 },
      );
    }
    if (!input.dryRun) {
      await repository.apply(mutations);
      const updatedEntries = await repository.getCatalogEntries();
      const changedURLs = mutations.map((mutation) => {
        const taskID =
          mutation.kind === "ingestTask"
            ? mutation.task.taskID
            : "taskID" in mutation
              ? mutation.taskID
              : null;
        return taskID ? updatedEntries[taskID].documentURL : rootURL;
      });
      // Keep local files on failure and exit nonzero; never report an unsent run
      // as success. Remote-head agreement is not a server disk-fsync receipt.
      await waitForSync(
        repo,
        [repository.catalogURL, ...changedURLs],
        network.remoteStorageID!,
      );
    }
    return { dryRun: input.dryRun ?? false, ...summary };
  } finally {
    try {
      try {
        await repository?.close();
      } finally {
        await repo?.shutdown();
      }
    } finally {
      await storage.close();
      await unlock();
    }
  }
}

export function summarizeMutations(mutations: readonly VaultMutation[]) {
  const counts: Record<string, number> = {};
  for (const { kind } of mutations) counts[kind] = (counts[kind] ?? 0) + 1;
  return { mutationCount: mutations.length, counts };
}

async function waitForSync(
  repo: Repo,
  urls: readonly AutomergeDocumentURL[],
  storageID: StorageId,
) {
  // Bound network requests while opening a whole import inventory.
  const unique = [...new Set(urls)];
  for (let start = 0; start < unique.length; start += 64) {
    const deadline = Date.now() + 30000;
    const signal = AbortSignal.timeout(30000);
    await Promise.all(
      unique.slice(start, start + 64).map(async (url) => {
        const handle = await repo.find(url as unknown as AutomergeUrl, {
          signal,
        });
        for (;;) {
          const local = [...handle.heads()].sort();
          const remote = handle
            .getSyncInfo(storageID)
            ?.lastHeads.slice()
            .sort();
          if (
            remote &&
            local.length === remote.length &&
            local.every((head, i) => head === remote[i])
          )
            return;
          if (Date.now() >= deadline)
            throw new Error("Private document synchronization timed out");
          await delay(20);
        }
      }),
    );
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 30000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string" },
      "dry-run": { type: "boolean" },
      report: { type: "string" },
    },
  });
  if (positionals.length !== 1)
    throw new Error(
      "Usage: bun run lab:ingest <ingestible.json> [--config <private-config>] [--dry-run] [--report <new-private-json-file>]",
    );
  const ingestible = JSON.parse(await fs.readFile(positionals[0], "utf8"));
  const result = createIngestibleValidator({
    mutateWithDefaultValues: true,
  }).validate(ingestible);
  if (!result.isValid)
    throw new Error(
      `Invalid ingestible JSON: ${JSON.stringify(result.errors)}`,
    );
  console.info(
    JSON.stringify(
      await runIngest({
        ingestible,
        configurationPath: values.config,
        dryRun: values["dry-run"],
        reportPath: values.report,
      }),
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Import failed");
    process.exitCode = 1;
  });
}
