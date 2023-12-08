import { Database, OrbitStore } from "@withorbit/store-shared";
import { AttachmentStoreFS } from "./attachmentStoreFS.js";
import { SQLDatabaseBackend } from "./sqlite.js";

/*
An on-disk Orbit store is a folder containing both a database of event / entity data and also a folder of on-disk attachment files.

This implementation is suitable for Node.js or React Native environments.
*/
export class OrbitStoreFS implements OrbitStore {
  database: Database;
  attachmentStore: AttachmentStoreFS;

  constructor(path: string) {
    const sqlDatabaseBackend = new SQLDatabaseBackend(path);
    this.database = new Database(sqlDatabaseBackend);
    this.attachmentStore = new AttachmentStoreFS(sqlDatabaseBackend);
  }

  async close(): Promise<void> {
    await this.database.close();
  }
}

export const databaseFileName = "db.sqlite";
export const attachmentFolderName = "attachments";
