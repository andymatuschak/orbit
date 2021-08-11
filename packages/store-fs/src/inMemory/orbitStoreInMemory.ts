import { Database, EventReducer, OrbitStore } from "@withorbit/store-shared";
import { AttachmentStoreInMemory } from "./attachmentStoreInMemory";
import { SQLDatabaseBackend } from "../sqlite";

// An in-memory implementation of OrbitStore, compatible with Node.js and React Native.
export class OrbitStoreInMemory implements OrbitStore {
  database: Database;
  attachmentStore: AttachmentStoreInMemory;

  constructor(eventReducer?: EventReducer) {
    this.database = new Database(
      new SQLDatabaseBackend(SQLDatabaseBackend.inMemoryDBSubpath),
      eventReducer,
    );

    this.attachmentStore = new AttachmentStoreInMemory();
  }
}
