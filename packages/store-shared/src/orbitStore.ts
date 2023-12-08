import { AttachmentStore } from "./attachmentStore.js";
import { Database } from "./database.js";

export interface OrbitStore {
  database: Database;
  attachmentStore: AttachmentStore;
}
