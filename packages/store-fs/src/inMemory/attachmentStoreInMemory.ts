import { AttachmentID, AttachmentMIMEType } from "@withorbit/core2";
import { AttachmentStore, encodeDataURL } from "@withorbit/store-shared";

/*
Implements an attachment store by retaining file data in memory. Probably mostly useful for testing and simple scripts.
 */
export class AttachmentStoreInMemory implements AttachmentStore {
  private readonly _store: Map<AttachmentID, StoredAttachmentRecord>;

  constructor() {
    this._store = new Map();
  }

  async getURLForStoredAttachment(id: AttachmentID): Promise<string | null> {
    const record = this._store.get(id);
    if (record) {
      return encodeDataURL(record.data, record.type);
    } else {
      return null;
    }
  }

  async getAttachmentContents(id: AttachmentID): Promise<Uint8Array> {
    const record = this._store.get(id);
    if (!record) {
      throw new Error(`Missing attachment ${id}`);
    }
    return new Uint8Array(record.data);
  }

  async storeAttachment(
    contents: Uint8Array,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void> {
    this._store.set(id, {
      data: contents,
      type,
    });
  }
}

interface StoredAttachmentRecord {
  data: ArrayBuffer;
  type: AttachmentMIMEType;
}
