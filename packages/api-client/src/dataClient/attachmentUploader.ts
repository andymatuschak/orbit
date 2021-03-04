import { Attachment, AttachmentID } from "metabook-core";

export default interface AttachmentUploader {
  (attachment: Attachment, attachmentID: AttachmentID): Promise<void>;
}
