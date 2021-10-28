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
  getAttachment(
    id: AttachmentID,
  ): Promise<{ contents: Uint8Array; type: AttachmentMIMEType }>;
}
