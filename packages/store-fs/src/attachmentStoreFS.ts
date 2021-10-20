import { AttachmentID, AttachmentMIMEType } from "@withorbit/core";
import { AttachmentStore } from "@withorbit/store-shared";
import { SQLDatabaseBackend } from "./sqlite";

// Facade exposing attachment I/O via SQLite blobs.
export class AttachmentStoreFS implements AttachmentStore {
  private readonly _sqlDatabaseBackend: SQLDatabaseBackend;
  constructor(sqlDatabaseBackend: SQLDatabaseBackend) {
    this._sqlDatabaseBackend = sqlDatabaseBackend;
  }

  async storeAttachment(
    contents: Uint8Array,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void> {
    return this._sqlDatabaseBackend.storeAttachment(contents, id, type);
  }

  async getURLForStoredAttachment(id: AttachmentID): Promise<string | null> {
    return this._sqlDatabaseBackend.getURLForStoredAttachment(id);
  }

  async getAttachmentContents(id: AttachmentID): Promise<Uint8Array> {
    return this._sqlDatabaseBackend.getAttachmentContents(id);
  }
}
