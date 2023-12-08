import { Database, EventReducer, OrbitStore } from "@withorbit/store-shared";
import { AttachmentStoreWeb } from "./attachmentStoreWeb.js";
import { IDBDatabaseBackend } from "./indexedDB.js";

export class OrbitStoreWeb implements OrbitStore {
  database: Database;
  attachmentStore: AttachmentStoreWeb;

  constructor({
    databaseName,
    indexedDB,
    eventReducer,
  }: {
    databaseName?: string;
    indexedDB?: IDBFactory;
    eventReducer?: EventReducer;
  }) {
    this.database = new Database(
      new IDBDatabaseBackend(databaseName, indexedDB),
      eventReducer,
    );
    this.attachmentStore = new AttachmentStoreWeb(
      `${databaseName}-attachments`,
      indexedDB,
    );
  }
}
