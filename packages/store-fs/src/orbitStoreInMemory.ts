import {
  AttachmentStore,
  Database,
  EventReducer,
  OrbitStore,
} from "@withorbit/store-shared";
import { AttachmentStoreFS } from "./attachmentStoreFS.js";
import { SQLDatabaseBackend } from "./sqlite.js";

// An in-memory implementation of OrbitStore, compatible with Node.js and React Native.
export class OrbitStoreInMemory implements OrbitStore {
  database: Database;
  attachmentStore: AttachmentStore;

  constructor(eventReducer?: EventReducer) {
    const sqlDatabaseBackend = new SQLDatabaseBackend(
      SQLDatabaseBackend.inMemoryDBSubpath,
      { enableDebugLogs: false },
    );
    this.database = new Database(sqlDatabaseBackend, eventReducer);

    this.attachmentStore = new AttachmentStoreFS(sqlDatabaseBackend);
  }
}
