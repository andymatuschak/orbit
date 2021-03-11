import { AttachmentID } from "./attachmentID";
import { AttachmentType } from "./attachmentType";

export interface AttachmentURLReference {
  type: AttachmentType;
  url: string;
}

export type AttachmentResolutionMap = Map<AttachmentID, AttachmentURLReference>;
