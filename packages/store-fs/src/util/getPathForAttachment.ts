import path from "path";
import {
  AttachmentID,
  AttachmentMIMEType,
  getFileExtensionForAttachmentMIMEType,
} from "@withorbit/core";

export function getPathForAttachment(
  basePath: string,
  id: AttachmentID,
  type: AttachmentMIMEType,
) {
  return path.join(
    basePath,
    `${id}.${getFileExtensionForAttachmentMIMEType(type)}`,
  );
}
