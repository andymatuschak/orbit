import { AttachmentStore } from "@withorbit/store-shared";
import { AttachmentID, AttachmentReference } from "@withorbit/core2";

/*
This is a stub implementation of AttachmentStore for web clients. Rather than actually download the attachments, we just keep track of the remote URL we were given for each attachment ID, then return that when the attachment ID is subsequently requested. So this won't produce a store which will actually work offline.

A proper implementation of this class for web will require a service worker which uses CacheStorage and an onfetch handler to store and replay the data for the attachments.

A simpler apprach, which wouldn't require a service worker, could store the attachments as Blobs in localStorage or IDB, then vend URLs using URL.createObjectURL. The downside of this approach is that computing the URL requires reading the attachment into memory and storing it there so long as the URL is in use. We'd also need to somehow call URL.revokeObjectURL when it's no longer in use, which will require extra complexity at client sites.
 */
export class AttachmentStoreWeb implements AttachmentStore {
  private _attachmentIDsToURLs: Map<AttachmentID, string>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(storeName = "OrbitAttachmentStore") {
    this._attachmentIDsToURLs = new Map();
  }

  async storeAttachmentFromURL(
    url: string,
    attachmentReference: AttachmentReference,
  ): Promise<void> {
    this._attachmentIDsToURLs.set(attachmentReference.id, url);
  }

  async getURLForStoredAttachment(
    attachmentReference: AttachmentReference,
  ): Promise<string | null> {
    return this._attachmentIDsToURLs.get(attachmentReference.id) ?? null;
  }
}
