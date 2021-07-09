import { AttachmentStoreWeb } from "../attachmentStores/attachmentStoreWeb";
import { Database } from "../database";
import { IDBDatabaseBackend } from "../database/backends/indexedDB";
import { OrbitStore } from "../orbitStore";

export class OrbitStoreWeb implements OrbitStore {
  database: Database;
  attachmentStore: AttachmentStoreWeb;

  constructor(indexedDB?: IDBFactory, databaseName?: string) {
    this.database = new Database(
      new IDBDatabaseBackend(indexedDB, databaseName),
    );
    this.attachmentStore = new AttachmentStoreWeb(databaseName);
  }
}
