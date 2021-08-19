import { AttachmentID, AttachmentMIMEType } from "@withorbit/core";

export interface AttachmentStore {
  storeAttachment(
    contents: Uint8Array,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void>;

  // If the attachment has already been stored, resolves to its local URL; otherwise resolves to null.
  getURLForStoredAttachment(id: AttachmentID): Promise<string | null>;

  // Rejects if the attachment is not stored.
  getAttachmentContents(id: AttachmentID): Promise<Uint8Array>;
}
