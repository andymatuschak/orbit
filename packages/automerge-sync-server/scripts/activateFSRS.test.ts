import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { Repo, type AutomergeUrl } from "@automerge/automerge-repo";
import { getHeads } from "@automerge/automerge";
import {
  AttachmentMIMEType,
  defaultOrbitSchedulerPolicy,
  projectVault,
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  type AttachmentID,
  type AutomergeDocumentURL,
  type FSRSSchedulerPolicy,
  type ObservationID,
  type OrbitVault,
  type TaskID,
  type VaultID,
  type VaultMutationID,
} from "@withorbit/core";
import {
  RepoAutomergeAttachmentWriter,
  RepoPerTaskDocuments,
} from "@withorbit/store-automerge";
import {
  decodePerTaskVaultCatalog,
  decodePerTaskVaultRoot,
} from "@withorbit/store-shared/perTaskCodec";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { default_w, fsrs, Rating } from "ts-fsrs";
import { loadLabConfiguration } from "../src/config.js";
import { AtomicNodeFSStorageAdapter } from "../src/storage/atomicNodeFSStorageAdapter.js";
import { acquireWriterLock } from "../src/storage/storageMetadata.js";
import { activateFSRS } from "./activateFSRS.js";
import { readCapturedVault } from "./labSeed.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

const day = 86_400_000;
const cutover = Date.parse("2026-10-14T12:00:00Z");
const taskID = "fsrs-activation-task" as TaskID;
const untouchedID = "fsrs-untouched-task" as TaskID;
const attachmentID = "fsrs-activation-attachment" as AttachmentID;
const token = "private-fsrs-test-token-never-returned-0123456789";

test("FSRS activation saves a private original-policy snapshot and changes only root policy", async () => {
  const source = await fixture();
  const before = await inspect(source);
  const snapshotDestination = path.join(await directory(), "snapshot");
  const receipt = await activateFSRS({
    configurationPath: source.configurationPath,
    weights: [...default_w],
    snapshotDestination,
    cutoverTimestampMillis: cutover,
  });
  expect(receipt).toMatchObject({
    rootOnly: true,
    rootDocumentURL: source.rootDocumentURL,
    cutoverTimestampMillis: cutover,
    requestedRetention: 0.9,
    modelVersion: 6,
  });
  expect(JSON.stringify(receipt)).not.toContain(token);
  const snapshotConfig = await loadLabConfiguration(
    receipt.snapshotConfigurationPath,
  );
  expect(snapshotConfig.pairingToken).toBe(token);
  expect(await fs.realpath(snapshotConfig.storageRoot)).toBe(
    await fs.realpath(path.join(snapshotDestination, "repo")),
  );
  expect((await fs.stat(receipt.snapshotConfigurationPath)).mode & 0o777).toBe(
    0o600,
  );
  expect((await fs.stat(snapshotDestination)).mode & 0o777).toBe(0o700);
  const backup = await readCapturedVault({
    storageRoot: snapshotConfig.storageRoot,
    rootDocumentURL: source.rootDocumentURL,
  });
  expect(backup.vault).toEqual(before.vault);
  expect(backup.attachmentBytes[attachmentID]).toEqual(source.image);

  const after = await inspect(source);
  const policy = after.vault.scheduler as FSRSSchedulerPolicy;
  expect(policy).toEqual({
    kind: "fsrs",
    version: 1,
    modelVersion: 6,
    weights: [...default_w],
    requestedRetention: 0.9,
    cutoverTimestampMillis: cutover,
    previousPolicy: defaultOrbitSchedulerPolicy,
  });
  expect({ ...after.vault, scheduler: before.vault.scheduler }).toEqual(
    before.vault,
  );
  expect({ ...after.root.data, scheduler: before.root.data.scheduler }).toEqual(
    before.root.data,
  );
  expect(after.root.heads).not.toEqual(before.root.heads);
  expect(after.catalog).toEqual(before.catalog);
  expect(after.taskSnapshots).toEqual(before.taskSnapshots);
  expect(after.attachmentSnapshots).toEqual(before.attachmentSnapshots);
  expect(schedulingDates(after.vault)).toEqual(schedulingDates(before.vault));
  await expectNoWriter(source.storageRoot);

  // Reopen the ordinary persisted Repo after the operator exits. A future
  // review changes the model, while the untouched task keeps its original date.
  const open = await openRepository(source);
  try {
    const prior = (
      await open.repository.getTaskProjections([taskID])
    ).tasks.get(taskID)!.componentStates.main;
    expect(prior.fsrs).toBeDefined();
    const occurredAtTimestampMillis = cutover + day;
    await open.repository.apply([
      {
        kind: "recordReview",
        mutationID: "future-fsrs-mutation" as VaultMutationID,
        observationID: "future-fsrs-review" as ObservationID,
        taskID,
        componentID: "main",
        reviewSessionID: "new-fsrs-session",
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis,
      },
    ]);
    const actual = (
      await open.repository.getTaskProjections([taskID])
    ).tasks.get(taskID)!.componentStates.main;
    const algorithm = fsrs({
      w: [...default_w],
      request_retention: 0.9,
      enable_fuzz: false,
      enable_short_term: true,
      learning_steps: [],
      relearning_steps: [],
    });
    const expected = algorithm.next_state(prior.fsrs!, 11, Rating.Good);
    expect(actual.fsrs).toEqual({
      ...expected,
      lastReviewTimestampMillis: occurredAtTimestampMillis,
    });
    expect(actual.intervalMillis).toBe(
      algorithm.next_interval(expected.stability, 11) * day,
    );
    expect(actual.dueTimestampMillis).toBe(
      occurredAtTimestampMillis + actual.intervalMillis,
    );
    const current = await open.repository.readLogicalVault();
    expect(current.tasks).toEqual(before.vault.tasks);
    expect(current.attachments).toEqual(before.vault.attachments);
    const { ["future-fsrs-review" as ObservationID]: saved, ...history } =
      current.observations;
    expect(saved?.outcome).toBe(TaskRepetitionOutcome.Remembered);
    expect(history).toEqual(before.vault.observations);
    expect(
      (await open.repository.getTaskProjections([untouchedID])).tasks.get(
        untouchedID,
      )!.componentStates.main.dueTimestampMillis,
    ).toBe(
      schedulingDates(before.vault).get(untouchedID)?.main.dueTimestampMillis,
    );
  } finally {
    await open.close();
  }
  const persisted = await inspect(source);
  expect(
    persisted.vault.observations["future-fsrs-review" as ObservationID],
  ).toBeDefined();
  expect(persisted.vault.scheduler).toEqual(policy);
});

test("activation refuses an active writer without root changes or a partial snapshot", async () => {
  const source = await fixture();
  const before = await inspect(source);
  const snapshotDestination = path.join(await directory(), "snapshot");
  const release = await acquireWriterLock(source.storageRoot);
  try {
    await expect(
      activateFSRS({
        configurationPath: source.configurationPath,
        weights: [...default_w],
        snapshotDestination,
        cutoverTimestampMillis: cutover,
      }),
    ).rejects.toThrow("another writer");
    await expect(fs.stat(snapshotDestination)).rejects.toThrow("ENOENT");
    await expect(acquireWriterLock(source.storageRoot)).rejects.toThrow(
      "another writer",
    );
  } finally {
    await release();
  }
  expect(await inspect(source)).toEqual(before);
});

test("invalid weights leave the policy unchanged and release the writer lock", async () => {
  const source = await fixture();
  const before = await inspect(source);
  await expect(
    activateFSRS({
      configurationPath: source.configurationPath,
      weights: [...default_w.slice(0, 20), Infinity],
      snapshotDestination: path.join(await directory(), "snapshot"),
      cutoverTimestampMillis: cutover,
    }),
  ).rejects.toThrow("Unsupported scheduler policy");
  expect(await inspect(source)).toEqual(before);
  await expectNoWriter(source.storageRoot);
  const release = await acquireWriterLock(source.storageRoot);
  await release();
});

test("activation is one-time: an FSRS root cannot be activated again", async () => {
  const source = await fixture();
  const input = {
    configurationPath: source.configurationPath,
    weights: [...default_w],
    cutoverTimestampMillis: cutover,
  };
  await activateFSRS({
    ...input,
    snapshotDestination: path.join(await directory(), "first"),
  });
  const before = await inspect(source);
  await expect(
    activateFSRS({
      ...input,
      snapshotDestination: path.join(await directory(), "second"),
    }),
  ).rejects.toThrow("requires the original Orbit policy");
  expect(await inspect(source)).toEqual(before);
  await expectNoWriter(source.storageRoot);
});

function schedulingDates(vault: OrbitVault) {
  return new Map(
    [...projectVault({ document: vault }).tasks].map(([id, task]) => [
      id,
      Object.fromEntries(
        Object.entries(task.componentStates).map(
          ([componentID, { fsrs: _memory, ...dates }]) => [componentID, dates],
        ),
      ),
    ]),
  );
}

async function expectNoWriter(storageRoot: string) {
  const release = await acquireWriterLock(storageRoot);
  await release();
}

async function openRepository(source: {
  storageRoot: string;
  rootDocumentURL: AutomergeDocumentURL;
}) {
  const storage = new AtomicNodeFSStorageAdapter(source.storageRoot);
  const repo = new Repo({ storage, network: [] });
  const documents = new RepoPerTaskDocuments(repo);
  const repository = await PerTaskRepository.open(
    documents,
    source.rootDocumentURL,
  );
  return {
    repo,
    documents,
    repository,
    close: async () => {
      await repository.close();
      await repo.shutdown();
      await storage.close();
    },
  };
}

async function inspect(source: {
  storageRoot: string;
  rootDocumentURL: AutomergeDocumentURL;
}) {
  const open = await openRepository(source);
  try {
    const root = (await open.documents.read(source.rootDocumentURL))!;
    const decoded = decodePerTaskVaultRoot(root.data);
    const catalog = (await open.documents.read(open.repository.catalogURL))!;
    const entries = decodePerTaskVaultCatalog(catalog.data).entries;
    return {
      root: { data: root.data as Record<string, unknown>, heads: root.heads },
      catalog,
      taskSnapshots: await Promise.all(
        Object.values(entries).map((entry) =>
          open.documents.read(entry.documentURL),
        ),
      ),
      attachmentSnapshots: await Promise.all(
        Object.values(decoded.attachments).map(async (entry) => ({
          heads: getHeads(
            (
              await open.repo.find(entry.documentURL as unknown as AutomergeUrl)
            ).fullDoc(),
          ).sort(),
          bytes: (await open.documents.readAttachment(entry)).bytes,
        })),
      ),
      vault: await open.repository.readLogicalVault(),
    };
  } finally {
    await open.close();
  }
}

async function fixture() {
  const base = await directory();
  const storageRoot = path.join(base, "repo");
  await fs.mkdir(storageRoot);
  const storage = new AtomicNodeFSStorageAdapter(storageRoot);
  const repo = new Repo({ storage, network: [] });
  const image = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  const { catalogEntry } = await new RepoAutomergeAttachmentWriter(
    repo,
  ).prepare({
    attachmentID,
    bytes: image,
    mediaTypeHint: AttachmentMIMEType.PNG,
  });
  const task = {
    createdAtTimestampMillis: cutover - 30 * day,
    isDeleted: false,
    provenance: null,
    metadata: { custom: "preserved" },
    spec: {
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.QA,
        body: { text: "Private fixture", attachments: [attachmentID] },
        answer: { text: "Preserved answer", attachments: [] },
      },
    },
  };
  const repository = await PerTaskRepository.create(
    new RepoPerTaskDocuments(repo),
    {
      vaultID: "fsrs-operator-fixture" as VaultID,
      createdAtTimestampMillis: task.createdAtTimestampMillis,
      scheduler: defaultOrbitSchedulerPolicy,
      attachments: { [attachmentID]: catalogEntry },
      tasks: { [taskID]: task, [untouchedID]: task },
      observations: {
        ["first" as ObservationID]: {
          kind: "review",
          taskID,
          componentID: "main",
          occurredAtTimestampMillis: cutover - 20 * day,
          reviewSessionID: "history",
          outcome: TaskRepetitionOutcome.Remembered,
        },
        ["second" as ObservationID]: {
          kind: "review",
          taskID,
          componentID: "main",
          occurredAtTimestampMillis: cutover - 10 * day,
          reviewSessionID: "history",
          outcome: TaskRepetitionOutcome.Forgotten,
        },
        ["defer" as ObservationID]: {
          kind: "reschedule",
          taskID,
          componentID: "main",
          occurredAtTimestampMillis: cutover - day,
          newDueTimestampMillis: cutover + 3 * day,
        },
      },
    },
  );
  const rootDocumentURL = repository.rootURL;
  await repository.close();
  await repo.shutdown();
  await storage.close();
  const configurationPath = path.join(base, "config.json");
  await fs.writeFile(
    configurationPath,
    JSON.stringify({ storageRoot, rootDocumentURL, pairingToken: token }),
    { mode: 0o600 },
  );
  return { storageRoot, rootDocumentURL, configurationPath, image };
}

async function directory() {
  const result = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-fsrs-activation-test-"),
  );
  directories.push(result);
  return result;
}
