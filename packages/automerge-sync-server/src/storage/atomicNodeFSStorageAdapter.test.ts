import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import type { StorageAdapterInterface } from "@automerge/automerge-repo";
import { ensureStorageID, storageTreeStatistics } from "./storageMetadata.js";
import { AtomicNodeFSStorageAdapter } from "./atomicNodeFSStorageAdapter.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("atomic NodeFS Repo storage", () => {
  test("passes key/value/range conformance and isolates adversarial segments", async () => {
    const storage = new AtomicNodeFSStorageAdapter(await temporaryDirectory());
    await runStorageConformance(storage);
    await storage.save(["prefix", "../escape", "tail"], bytes(11));
    await storage.save(["prefix", "with/slash", "tail"], bytes(12));
    await storage.save(["prefix", "with\0nul", "tail"], bytes(13));
    const loaded = await storage.loadRange(["prefix"]);
    expect(loaded.map(({ key }) => key)).toContainEqual([
      "prefix",
      "../escape",
      "tail",
    ]);
    expect(loaded).toHaveLength(3);
  });

  test("loads more than 1,000 keys and ignores uncommitted temporary values", async () => {
    const directory = await temporaryDirectory();
    const storage = new AtomicNodeFSStorageAdapter(directory, 24);
    await Promise.all(
      Array.from({ length: 1_005 }, (_, index) =>
        storage.save(["many", String(index)], bytes(index % 251)),
      ),
    );
    await fs.writeFile(path.join(directory, ".pending-killed-process"), "x");

    expect(await storage.loadRange(["many"])).toHaveLength(1_005);
    expect(storage.metrics.maximumActiveOperations).toBeLessThanOrEqual(24);
    expect(await storageTreeStatistics(directory)).toEqual({
      objectCount: 1_005,
      byteLength: 1_005,
    });
  }, 30_000);

  test("keeps a stable storage ID across reopen and backup restore", async () => {
    const source = await temporaryDirectory();
    const restored = await temporaryDirectory();
    const first = new AtomicNodeFSStorageAdapter(source);
    const storageID = await ensureStorageID(first);
    await first.save(["document", "snapshot", "one"], bytes(42));
    await fs.cp(source, restored, { recursive: true });

    const replacement = new AtomicNodeFSStorageAdapter(restored);
    expect(await ensureStorageID(replacement)).toBe(storageID);
    expect(await replacement.load(["document", "snapshot", "one"])).toEqual(
      bytes(42),
    );
  });

  test("close drains queued filesystem work before volume release", async () => {
    const directory = await temporaryDirectory();
    const storage = new AtomicNodeFSStorageAdapter(directory, 4);
    const saves = Array.from({ length: 25 }, (_, index) =>
      storage.save(["closing", String(index)], bytes(index)),
    );
    await storage.close();
    await Promise.all(saves);
    const reopened = new AtomicNodeFSStorageAdapter(directory);
    expect(await reopened.loadRange(["closing"])).toHaveLength(25);
    await storage.save(["closing", "late"], bytes(99));
    expect(await reopened.load(["closing", "late"])).toBeUndefined();
  });

  test("serializes concurrent writes and refuses whole-Repo removal", async () => {
    const directory = await temporaryDirectory();
    const initial = new AtomicNodeFSStorageAdapter(directory, 1);
    await initial.save(["a", "one"], new Uint8Array([1, 2, 3]));
    await initial.close();
    const reopened = new AtomicNodeFSStorageAdapter(directory, 1);
    const writes = await Promise.allSettled([
      reopened.save(["a", "two"], new Uint8Array([4, 5])),
      reopened.save(["ab", "other"], new Uint8Array([6, 7])),
    ]);
    expect(writes.map(({ status }) => status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect((await storageTreeStatistics(directory)).byteLength).toBe(7);
    expect(reopened.metrics.bytesRead).toBe(0);
    expect(reopened.metrics.maximumActiveOperations).toBe(1);
    await expect(reopened.removeRange([])).rejects.toThrow(
      "Invalid Automerge storage key",
    );
    await reopened.remove(["a", "one"]);
    await reopened.save(["ab", "other"], new Uint8Array([6, 7]));
    await reopened.removeRange(["a"]);
    expect((await storageTreeStatistics(directory)).byteLength).toBe(2);
    expect(await reopened.load(["ab", "other"])).toEqual(
      new Uint8Array([6, 7]),
    );
  });
});

async function runStorageConformance(storage: StorageAdapterInterface) {
  expect(await storage.load(["missing"])).toBeUndefined();
  await storage.save(["doc", "sync", "a"], bytes(1));
  await storage.save(["doc", "snapshot", "b"], bytes(2));
  await storage.save(["doc", "sync", "c"], bytes(3));
  expect(
    (await storage.loadRange(["doc", "sync"])).map(({ key }) => key),
  ).toEqual([
    ["doc", "sync", "a"],
    ["doc", "sync", "c"],
  ]);
  await storage.save(["doc", "sync", "a"], bytes(4));
  expect(await storage.load(["doc", "sync", "a"])).toEqual(bytes(4));
  await storage.remove(["doc", "snapshot", "b"]);
  expect(await storage.load(["doc", "snapshot", "b"])).toBeUndefined();
  await storage.removeRange(["doc", "sync"]);
  expect(await storage.loadRange(["doc"])).toEqual([]);
}

function bytes(value: number) {
  return new Uint8Array([value]);
}

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-sync-storage-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}
