import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  StorageAdapterInterface,
  StorageId,
  StorageKey,
} from "@automerge/automerge-repo";

export function accountStorageDirectory(root: string, hostedVaultID: string) {
  const opaqueDirectory = createHash("sha256")
    .update(`orbit-hosted-vault:${hostedVaultID}`)
    .digest("hex");
  return path.join(root, "v1", "accounts", opaqueDirectory, "repo");
}

export async function ensureStorageID(
  storage: StorageAdapterInterface,
): Promise<StorageId> {
  const key = ["storage-adapter-id"] as StorageKey;
  const existing = await storage.load(key);
  if (existing) return new TextDecoder().decode(existing) as StorageId;
  const storageID = randomUUID() as StorageId;
  await storage.save(key, new TextEncoder().encode(storageID));
  return storageID;
}

export async function storageTreeStatistics(root: string) {
  const visit = async (
    directory: string,
  ): Promise<{ objectCount: number; byteLength: number }> => {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { objectCount: 0, byteLength: 0 };
      }
      throw error;
    }
    const children = await Promise.all(
      entries.map(async (entry) => {
        const child = path.join(directory, entry.name);
        if (entry.isDirectory()) return visit(child);
        if (entry.isFile() && entry.name === "_value") {
          return { objectCount: 1, byteLength: (await fs.stat(child)).size };
        }
        return { objectCount: 0, byteLength: 0 };
      }),
    );
    return children.reduce(
      (total, child) => ({
        objectCount: total.objectCount + child.objectCount,
        byteLength: total.byteLength + child.byteLength,
      }),
      { objectCount: 0, byteLength: 0 },
    );
  };
  return visit(root);
}
