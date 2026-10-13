import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import {
  Repo,
  parseAutomergeUrl,
  type AutomergeUrl,
} from "@automerge/automerge-repo";
import {
  AttachmentMIMEType,
  TaskContentType,
  TaskSpecType,
  TaskRepetitionOutcome,
  defaultOrbitSchedulerPolicy,
  type AttachmentID,
  type ObservationID,
  type VaultID,
  type TaskID,
} from "@withorbit/core";
import {
  RepoPerTaskDocuments,
  RepoAutomergeAttachmentWriter,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { AtomicNodeFSStorageAdapter } from "../src/storage/atomicNodeFSStorageAdapter.js";
import {
  readCapturedVault,
  seedLabVault,
  runLabSeed,
  vaultSummary,
} from "./labSeed.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test("captured bytes seed fresh document URLs while preserving tasks, reviews, projections and attachments", async () => {
  const source = await fixture();
  const before = await treeDigest(source.storageRoot);
  const captured = await readCapturedVault(source);
  const destination = path.join(await directory(), "private-vault");
  const receipt = await seedLabVault({ source: captured, destination });
  expect(await treeDigest(source.storageRoot)).toBe(before);
  expect(receipt.rootDocumentURL).not.toBe(source.rootDocumentURL);
  expect(receipt.vaultID).not.toBe(captured.vault.vaultID);
  expect(receipt).toMatchObject({
    taskCount: 1,
    observationCount: 2,
    reviewCount: 2,
    attachmentCount: 1,
    attachmentBytes: source.image.length,
    latestReviewIDs: ["latest-review", "first-review"],
  });
  expect(JSON.stringify(receipt)).not.toContain("confidential prompt");
  const seeded = await readCapturedVault({
    storageRoot: destination,
    rootDocumentURL: receipt.rootDocumentURL,
  });
  expect(vaultSummary(seeded.vault)).toEqual(vaultSummary(captured.vault));
  expect(seeded.attachmentBytes[attachmentID]).toEqual(source.image);
  expect(seeded.vault.attachments[attachmentID].documentURL).not.toBe(
    captured.vault.attachments[attachmentID].documentURL,
  );
  const sourceIDs = new Set(
    (
      await new AtomicNodeFSStorageAdapter(source.storageRoot).loadRange([])
    ).map(({ key }) => key[0]),
  );
  for (const { key } of await new AtomicNodeFSStorageAdapter(
    destination,
  ).loadRange([]))
    if (key[0] !== "storage-adapter-id")
      expect(sourceIDs.has(key[0])).toBe(false);
});

test("portable offline export/import preserves data and refuses to overwrite an existing export or vault", async () => {
  const source = await fixture();
  const root = await directory();
  const filename = path.join(root, "private-export.json");
  const args = [
    "export",
    "--source",
    source.storageRoot,
    "--root",
    source.rootDocumentURL,
    "--output",
    filename,
  ];
  const report = await runLabSeed(args);
  expect((await fs.stat(filename)).mode & 0o777).toBe(0o600);
  const destination = path.join(root, "private-vault");
  const seeded = await runLabSeed([
    "seed",
    "--vault-json",
    filename,
    "--destination",
    destination,
  ]);
  expect(seeded).toMatchObject(report);
  const before = await treeDigest(destination);
  await expect(runLabSeed(args)).rejects.toThrow("EEXIST");
  await expect(
    runLabSeed([
      "seed",
      "--vault-json",
      filename,
      "--destination",
      destination,
    ]),
  ).rejects.toThrow("EEXIST");
  expect(await treeDigest(destination)).toBe(before);
});

test("incomplete captures and checksum failures stop before private storage is created", async () => {
  const source = await fixture();
  const attachmentURL = (await readCapturedVault(source)).vault.attachments[
    attachmentID
  ].documentURL;
  const adapter = new AtomicNodeFSStorageAdapter(source.storageRoot);
  const id = parseAutomergeUrl(
    attachmentURL as unknown as AutomergeUrl,
  ).documentId;
  await adapter.removeRange([id]);
  await expect(readCapturedVault(source)).rejects.toThrow(
    "attachment document is missing",
  );
  const fresh = await readCapturedVault(await fixture());
  fresh.attachmentBytes[attachmentID][
    fresh.attachmentBytes[attachmentID].length - 1
  ] ^= 1;
  const destination = path.join(await directory(), "private-vault");
  await expect(seedLabVault({ source: fresh, destination })).rejects.toThrow();
  await expect(fs.stat(destination)).rejects.toThrow("ENOENT");
});

test("private destination cannot be a Git checkout", async () => {
  const source = await readCapturedVault(await fixture());
  const checkout = await directory();
  await fs.mkdir(path.join(checkout, ".git"));
  const destination = path.join(checkout, "private-vault");
  await expect(seedLabVault({ source, destination })).rejects.toThrow(
    "outside Git",
  );
  await expect(fs.stat(destination)).rejects.toThrow("ENOENT");
});

const taskID = "seed-task" as TaskID;
const attachmentID = "seed-image" as AttachmentID;

async function fixture() {
  const storageRoot = await directory();
  const repo = new Repo({
    storage: new AtomicNodeFSStorageAdapter(storageRoot),
    network: [],
  });
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
  const vault = await PerTaskRepository.create(new RepoPerTaskDocuments(repo), {
    vaultID: "source-public-vault" as VaultID,
    createdAtTimestampMillis: 1000,
    scheduler: defaultOrbitSchedulerPolicy,
    attachments: { [attachmentID]: catalogEntry },
    tasks: {
      [taskID]: {
        createdAtTimestampMillis: 1000,
        isDeleted: false,
        provenance: null,
        metadata: { custom: "preserved" },
        spec: {
          type: TaskSpecType.Memory,
          content: {
            type: TaskContentType.QA,
            body: { text: "confidential prompt", attachments: [attachmentID] },
            answer: { text: "preserved answer", attachments: [] },
          },
        },
      },
    },
    observations: Object.fromEntries(
      ["first-review", "latest-review"].map((id, index) => [
        id as ObservationID,
        {
          kind: "review" as const,
          taskID,
          componentID: "main",
          reviewSessionID: "historical-session",
          outcome: TaskRepetitionOutcome.Remembered,
          occurredAtTimestampMillis: 2000 + index * 1000,
        },
      ]),
    ),
  });
  const rootDocumentURL = vault.rootURL;
  await vault.close();
  await repo.shutdown();
  return { storageRoot, rootDocumentURL, image };
}

async function directory() {
  const result = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-lab-seed-test-"),
  );
  directories.push(result);
  return result;
}

async function treeDigest(root: string) {
  const files = (await fs.readdir(root, { recursive: true })).sort();
  const hash = createHash("sha256");
  for (const name of files) {
    const filename = path.join(root, name);
    if (!(await fs.stat(filename)).isFile()) continue;
    hash.update(name).update(await fs.readFile(filename));
  }
  return hash.digest("hex");
}
