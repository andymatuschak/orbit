import { randomUUID } from "node:crypto";
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

/** Refuse overlapping writers. After a crash, inspect the PID before explicitly removing the stale lock. */
export async function acquireWriterLock(
  storageRoot: string,
): Promise<() => Promise<void>> {
  const filename = path.join(storageRoot, ".writer-pid");
  let handle;
  try {
    handle = await fs.open(filename, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const pid = Number(await fs.readFile(filename, "utf8"));
    if (!Number.isSafeInteger(pid) || pid < 1)
      throw new Error(
        "Orbit Lab writer lock is unreadable; inspect .writer-pid before reopening",
      );
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      throw new Error(
        "Orbit Lab has a stale writer lock; confirm its PID is stopped, then remove .writer-pid explicitly",
      );
    }
    throw new Error("Orbit Lab storage is already open by another writer");
  }
  try {
    await handle.writeFile(String(process.pid));
  } finally {
    await handle.close();
  }
  return async () => {
    await fs.unlink(filename);
  };
}
