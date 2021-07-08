import { getFileExtensionForAttachmentMimeType } from "@withorbit/core";
import path from "path";
import { AttachmentReference } from "../core2";

export function getPathForAttachment(
  basePath: string,
  attachmentReference: AttachmentReference,
) {
  return path.join(
    basePath,
    `${attachmentReference.id}.${getFileExtensionForAttachmentMimeType(
      attachmentReference.mimeType,
    )}`,
  );
}
