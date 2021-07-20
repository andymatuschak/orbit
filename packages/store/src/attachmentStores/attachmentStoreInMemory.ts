import { AttachmentMimeType } from "@withorbit/core";
import { AttachmentStore } from "../attachmentStore";
import { AttachmentID, AttachmentReference } from "@withorbit/core2";
import { AttachmentDownloadError } from "./attachmentDownloadError";
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
    attachmentReference: AttachmentReference,
  ): Promise<void> {
    const response = await fetch(sourceURL);
    if (response.ok) {
      this._store.set(attachmentReference.id, {
        data: await response.arrayBuffer(),
        type: attachmentReference.mimeType,
      });
    } else {
      throw new AttachmentDownloadError({
        statusCode: response.status,
        bodyText: await response.text(),
      });
    }
  }

  async getURLForStoredAttachment(
    attachmentReference: AttachmentReference,
  ): Promise<string | null> {
    const record = this._store.get(attachmentReference.id);
    if (record) {
      const b64String = base64.fromByteArray(new Uint8Array(record.data));
      return `data:${attachmentReference.mimeType};base64,${b64String}`;
    } else {
      return null;
    }
  }
}

interface StoredAttachmentRecord {
  data: ArrayBuffer;
  type: AttachmentMimeType;
}
