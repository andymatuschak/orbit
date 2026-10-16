import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { afterEach, expect, test } from "bun:test";
import { acquireWriterLock } from "./storageMetadata.js";

const directories: string[] = [];
const children = new Set<ChildProcess>();
afterEach(async () => {
  for (const child of children) {
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
  children.clear();
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
  const inode = (await fs.stat(path.join(root, ".writer-lock"))).ino;
  await release();
  await (
    await acquireWriterLock(root)
  )();
  expect((await fs.stat(path.join(root, ".writer-lock"))).ino).toBe(inode);
});

test("an existing lock file is not itself a lock, and symlinks are refused", async () => {
  const root = await directory();
  const file = path.join(root, ".writer-lock");
  await fs.writeFile(file, "contents do not establish ownership");
  await (
    await acquireWriterLock(root)
  )();
  const other = await directory();
  await fs.symlink(file, path.join(other, ".writer-lock"));
  await expect(acquireWriterLock(other)).rejects.toThrow();
});

test("separate processes exclude one another; SIGKILL releases ownership without cleanup", async () => {
  const root = await directory();
  const child = await writer(root);
  await expect(acquireWriterLock(root)).rejects.toThrow("another writer");
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  const release = await acquireWriterLock(root);
  await expect(acquireWriterLock(root)).rejects.toThrow("another writer");
  await release();
  // Repeated crashes must not require a PID-file repair on the second restart.
  const next = await writer(root);
  const nextExited = once(next, "exit");
  next.kill("SIGKILL");
  await nextExited;
  await (
    await acquireWriterLock(root)
  )();
});

async function writer(root: string) {
  const module = new URL("./storageMetadata.ts", import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { acquireWriterLock } from ${JSON.stringify(module)};
     const release = await acquireWriterLock(process.argv[1]);
     process.stdin.on("end", async () => { await release(); process.exit(0); });
     process.stdout.write("locked"); process.stdin.resume();`,
      root,
    ],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  children.add(child);
  child.once("exit", () => children.delete(child));
  const ready = await Promise.race([
    once(child.stdout!, "data"),
    once(child, "exit").then(() => {
      throw new Error("Lock owner exited before acquiring");
    }),
  ]);
  expect(String(ready[0])).toBe("locked");
  return child;
}

async function directory() {
  const result = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-lab-lock-test-"),
  );
  directories.push(result);
  return result;
}
