import { AttachmentID, AttachmentMIMEType } from "@withorbit/core2";

export interface AttachmentStore {
  storeAttachmentFromURL(
    url: string,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void>;

  // If the attachment has already been stored, resolves to its local URL; otherwise resolves to null.
  getURLForStoredAttachment(
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<string | null>;
}
