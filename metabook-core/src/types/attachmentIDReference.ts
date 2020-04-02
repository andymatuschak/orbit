import { AttachmentID } from "./attachmentID";
import { AttachmentType } from "./attachmentType";

export interface AttachmentIDReference {
  type: AttachmentType;
  id: AttachmentID;
  byteLength: number;
}
