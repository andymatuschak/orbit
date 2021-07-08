import { AttachmentStoreInMemory } from "../attachmentStores/attachmentStoreInMemory";
import { Database } from "../database";
import { SQLDatabaseBackend } from "../database/backends/sqlite";
import { OrbitStore } from "../orbitStore";

// An in-memory implementation of OrbitStore, compatible with Node.js and React Native.
export class OrbitStoreInMemory implements OrbitStore {
  database: Database;
  attachmentStore: AttachmentStoreInMemory;

  constructor() {
    this.database = new Database(
      new SQLDatabaseBackend(SQLDatabaseBackend.inMemoryDBSubpath),
    );

    this.attachmentStore = new AttachmentStoreInMemory();
  }
}
