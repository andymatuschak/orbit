import { AttachmentReference } from "../entities/attachmentReference.js";
import { EntityType } from "../entity.js";
import { AttachmentIngestEvent } from "../event.js";

export function attachmentIngestEventReducer(
  oldAttachment: AttachmentReference | null,
  event: AttachmentIngestEvent,
): AttachmentReference {
  if (oldAttachment) {
    return oldAttachment;
  } else {
    return {
      id: event.entityID,
      createdAtTimestampMillis: event.timestampMillis,
      type: EntityType.AttachmentReference,
      mimeType: event.mimeType,
    };
  }
}
