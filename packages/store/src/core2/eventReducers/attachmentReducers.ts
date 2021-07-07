import { AttachmentReference } from "../entities/attachmentReference";
import { EntityType } from "../entities/entityBase";
import { AttachmentIngestEvent } from "../event";

export function attachmentIngestEventReducer(
  oldAttachment: AttachmentReference | null,
  event: AttachmentIngestEvent,
): AttachmentReference {
  if (oldAttachment) {
    return oldAttachment;
  } else {
    return {
      id: event.entityID,
      type: EntityType.AttachmentReference,
      mimeType: event.mimeType,
    };
  }
}
