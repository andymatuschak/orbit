import { AttachmentStore } from "./attachmentStore";
import { Database } from "./database";

export interface OrbitStore {
  database: Database;
  attachmentStore: AttachmentStore;
}
