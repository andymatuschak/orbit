import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { Repo } from "@automerge/automerge-repo";
import type { VaultID } from "@withorbit/core";
import { RepoPerTaskDocuments } from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { AtomicNodeFSStorageAdapter } from "../src/storage/atomicNodeFSStorageAdapter.js";
import { acquireWriterLock } from "../src/storage/storageMetadata.js";
import { loadLabConfiguration } from "../src/config.js";
import { readCapturedVault } from "./labSeed.js";
import { snapshotLab, restoreLab } from "./labSnapshot.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test("quiesced snapshot/restore preserves the vault, rewrites local paths and keeps pairing private", async () => {
  const source = await fixture();
  const destination = path.join(await directory(), "snapshot");
  const backup = await snapshotLab({
    configurationPath: source.configurationPath,
    destination,
  });
  const restored = await restoreLab({
    snapshot: destination,
    destination: path.join(await directory(), "restored"),
  });
  expect(restored.rootDocumentURL).toBe(source.rootDocumentURL);
  const config = await loadLabConfiguration(restored.configurationPath);
  expect(config.storageRoot).toBe(restored.storageRoot);
  expect(config.updatesRoot).toBe(
    path.join(path.dirname(restored.configurationPath), "updates"),
  );
  expect(config.pairingToken).toBe(source.token);
  const vault = await readCapturedVault({
    storageRoot: config.storageRoot,
    rootDocumentURL: source.rootDocumentURL,
  });
  expect(vault.vault.vaultID).toBe("snapshot-fixture" as VaultID);
  for (const root of [
    source.storageRoot,
    backup.storageRoot,
    restored.storageRoot,
  ])
    await expect(fs.stat(path.join(root, ".writer-pid"))).rejects.toThrow(
      "ENOENT",
    );
  expect((await fs.stat(restored.configurationPath)).mode & 0o777).toBe(0o600);
  expect((await fs.stat(destination)).mode & 0o777).toBe(0o700);
  expect(JSON.stringify(restored)).not.toContain(source.token);
});

test("snapshot refuses active writers, existing destinations and storage inside its source", async () => {
  const source = await fixture();
  const destination = path.join(await directory(), "snapshot");
  const release = await acquireWriterLock(source.storageRoot);
  await expect(
    snapshotLab({ configurationPath: source.configurationPath, destination }),
  ).rejects.toThrow("another writer");
  await release();
  await expect(fs.stat(destination)).rejects.toThrow("ENOENT");
  await snapshotLab({
    configurationPath: source.configurationPath,
    destination,
  });
  await expect(
    snapshotLab({ configurationPath: source.configurationPath, destination }),
  ).rejects.toThrow("EEXIST");
  await expect(
    restoreLab({ snapshot: destination, destination }),
  ).rejects.toThrow("EEXIST");
  await expect(
    snapshotLab({
      configurationPath: source.configurationPath,
      destination: path.join(source.storageRoot, "nested"),
    }),
  ).rejects.toThrow("inside its source");
});

async function fixture() {
  const base = await directory();
  const storageRoot = path.join(base, "repo");
  await fs.mkdir(storageRoot);
  const repo = new Repo({
    storage: new AtomicNodeFSStorageAdapter(storageRoot),
    network: [],
  });
  const vault = await PerTaskRepository.createEmpty(
    new RepoPerTaskDocuments(repo),
    { vaultID: "snapshot-fixture" as VaultID },
  );
  const rootDocumentURL = vault.rootURL;
  await vault.close();
  await repo.shutdown();
  const configurationPath = path.join(base, "config.json");
  const token = "private-snapshot-pairing-credential-0123456789";
  await fs.writeFile(
    configurationPath,
    JSON.stringify({ storageRoot, rootDocumentURL, pairingToken: token }),
    { mode: 0o600 },
  );
  return { storageRoot, rootDocumentURL, configurationPath, token };
}

async function directory() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-lab-snapshot-test-"),
  );
  directories.push(root);
  return root;
}
