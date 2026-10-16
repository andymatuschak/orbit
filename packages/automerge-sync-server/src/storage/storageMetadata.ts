import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  StorageAdapterInterface,
  StorageId,
} from "@automerge/automerge-repo";

export async function ensureStorageID(
  storage: StorageAdapterInterface,
): Promise<StorageId> {
  const key = ["storage-adapter-id"];
  const existing = await storage.load(key);
  if (existing) return new TextDecoder().decode(existing) as StorageId;
  const id = randomUUID() as StorageId;
  await storage.save(key, new TextEncoder().encode(id));
  return id;
}

/** Quiesced snapshots and diagnostics count committed files, not provisioned space. */
export async function storageTreeStatistics(
  directory: string,
): Promise<{ objectCount: number; byteLength: number }> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const children = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return storageTreeStatistics(file);
      return entry.isFile() && entry.name === "_value"
        ? { objectCount: 1, byteLength: (await fs.stat(file)).size }
        : { objectCount: 0, byteLength: 0 };
    }),
  );
  return children.reduce(
    (total, child) => ({
      objectCount: total.objectCount + child.objectCount,
      byteLength: total.byteLength + child.byteLength,
    }),
    { objectCount: 0, byteLength: 0 },
  );
}

/** The kernel owns the lock, not the file's contents. Never unlink its inode. */
export async function acquireWriterLock(
  storageRoot: string,
): Promise<() => Promise<void>> {
  const handle = await fs.open(
    path.join(storageRoot, ".writer-lock"),
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    // Descriptor 3 is a duplicate of our open file description. flock remains
    // held by our descriptor after this short-lived utility exits, and the OS
    // releases it even after SIGKILL. No helper process or stale-PID recovery.
    const darwin = process.platform === "darwin";
    if (!darwin && process.platform !== "linux")
      throw new Error("Orbit Lab writer locking requires macOS or Linux");
    const result = spawnSync(
      darwin ? "/usr/bin/lockf" : "/usr/bin/flock",
      darwin ? ["-s", "-t", "0", "3"] : ["-n", "3"],
      { stdio: ["ignore", "ignore", "pipe", handle.fd] },
    );
    if (result.error) throw result.error;
    if (result.status === (darwin ? 75 : 1))
      throw new Error("Orbit Lab storage is already open by another writer");
    if (result.status !== 0)
      throw new Error(`Could not lock Orbit Lab storage: ${result.stderr}`);
    return () => handle.close();
  } catch (error) {
    await handle.close();
    throw error;
  }
}
