import { AttachmentReference } from "./core2";

export interface AttachmentStore {
  storeAttachmentFromURL(
    url: string,
    attachmentReference: AttachmentReference,
  ): Promise<void>;

  // If the attachment has already been stored, resolves to its local URL; otherwise resolves to null.
  getURLForStoredAttachment(
    attachmentReference: AttachmentReference,
  ): Promise<string | null>;
}
