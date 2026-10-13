import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { acquireWriterLock } from "./storageMetadata.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test("one writer owns its lock until graceful release", async () => {
  const root = await directory();
  const release = await acquireWriterLock(root);
  await expect(acquireWriterLock(root)).rejects.toThrow("another writer");
  expect(await fs.readFile(path.join(root, ".writer-pid"), "utf8")).toBe(
    String(process.pid),
  );
  await release();
  await (
    await acquireWriterLock(root)
  )();
});

test("stale and unreadable locks require explicit inspection, never implicit deletion", async () => {
  const root = await directory();
  const file = path.join(root, ".writer-pid");
  await fs.writeFile(file, "99999999");
  await expect(acquireWriterLock(root)).rejects.toThrow("stale writer lock");
  expect(await fs.readFile(file, "utf8")).toBe("99999999");
  await fs.writeFile(file, "");
  await expect(acquireWriterLock(root)).rejects.toThrow("unreadable");
  expect(await fs.readFile(file, "utf8")).toBe("");
});

async function directory() {
  const result = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-lab-lock-test-"),
  );
  directories.push(result);
  return result;
}
