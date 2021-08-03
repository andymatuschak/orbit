import { AttachmentID, AttachmentMIMEType } from "@withorbit/core2";
import {
  AttachmentDownloadError,
  AttachmentStore,
} from "@withorbit/store-shared";
import base64 from "base64-js";

/*
Implements an attachment store by retaining file data in memory. Probably mostly useful for testing and simple scripts.
 */
export class AttachmentStoreInMemory implements AttachmentStore {
  private readonly _store: Map<AttachmentID, StoredAttachmentRecord>;

  constructor() {
    this._store = new Map();
  }

  async storeAttachmentFromURL(
    sourceURL: string,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void> {
    const response = await fetch(sourceURL);
    if (response.ok) {
      this._store.set(id, {
        data: await response.arrayBuffer(),
        type,
      });
    } else {
      throw new AttachmentDownloadError({
        statusCode: response.status,
        bodyText: await response.text(),
      });
    }
  }

  async getURLForStoredAttachment(id: AttachmentID): Promise<string | null> {
    const record = this._store.get(id);
    if (record) {
      const b64String = base64.fromByteArray(new Uint8Array(record.data));
      return `data:${record.type};base64,${b64String}`;
    } else {
      return null;
    }
  }
}

interface StoredAttachmentRecord {
  data: ArrayBuffer;
  type: AttachmentMIMEType;
}
