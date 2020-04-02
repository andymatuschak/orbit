import { AttachmentType } from "./attachmentType";

export interface Attachment {
  type: AttachmentType;
  mimeType: string;
  contents: string;
}
