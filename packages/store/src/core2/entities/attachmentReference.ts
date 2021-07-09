import { AttachmentMimeType } from "@withorbit/core";
import { EntityBase, EntityType } from "../entity";

// The Attachment entity tracks an on-disk file (e.g. an image, a video) which may be used by another entity. The data is not itself stored in this structure--this is just a referenced used to track the attachment in the database.
export interface AttachmentReference
  extends EntityBase<EntityType.AttachmentReference, AttachmentID> {
  mimeType: AttachmentMimeType;
}

/**
 * @TJS-type string
 */
export type AttachmentID = string & { __attachmentIDOpaqueType: never };
