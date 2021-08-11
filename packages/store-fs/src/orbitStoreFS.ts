import { EntityType } from "@withorbit/core2";
import { Database, OrbitStore } from "@withorbit/store-shared";
import fs from "fs";
import path from "path";
import { AttachmentStoreFS } from "./attachmentStoreFS";
import { SQLDatabaseBackend } from "./sqlite";

/*
An on-disk Orbit store is a folder containing both a database of event / entity data and also a folder of on-disk attachment files.

This implementation is suitable for Node.js or React Native environments.
*/
export class OrbitStoreFS implements OrbitStore {
  database: Database;
  attachmentStore: AttachmentStoreFS;

  static async open(
    storePath: string,
    createIfMissing: boolean,
  ): Promise<OrbitStoreFS> {
    const basePathStats = await fs.promises.stat(storePath).catch(() => null);
    if (basePathStats && !basePathStats.isDirectory()) {
      throw new Error("Unexpected non-directory file");
    }

    const attachmentsSubpath = path.join(storePath, attachmentFolderName);
    if (basePathStats) {
      const attachmentsFolderStats = await fs.promises
        .stat(attachmentsSubpath)
        .catch(() => null);
      if (attachmentsFolderStats && !attachmentsFolderStats.isDirectory()) {
        throw new Error("Unexpected non-directory attachments folder");
      }
      if (!attachmentsFolderStats) {
        await fs.promises.mkdir(attachmentsSubpath);
      }
    } else {
      if (createIfMissing) {
        await fs.promises.mkdir(storePath);
        await fs.promises.mkdir(attachmentsSubpath);
      } else {
        throw new Error("Path does not exist");
      }
    }

    const databaseSubpath = path.join(storePath, databaseFileName);
    return new OrbitStoreFS(databaseSubpath, attachmentsSubpath);
  }

  async close(): Promise<void> {
    await this.database.close();
  }

  private constructor(databaseSubpath: string, attachmentsSubpath: string) {
    this.database = new Database(new SQLDatabaseBackend(databaseSubpath));
    this.attachmentStore = new AttachmentStoreFS(
      attachmentsSubpath,
      async (id) => {
        const reference = (await this.database.getEntities([id])).get(id);
        return (
          (reference?.type === EntityType.AttachmentReference &&
            reference.mimeType) ||
          null
        );
      },
    );
  }
}

export const databaseFileName = "db.sqlite";
export const attachmentFolderName = "attachments";
