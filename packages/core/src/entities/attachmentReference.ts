import { EntityBase, EntityType } from "../entity.js";

// The Attachment entity tracks an on-disk file (e.g. an image, a video) which may be used by another entity. The data is not itself stored in this structure--this is just a referenced used to track the attachment in the database.
export interface AttachmentReference
  extends EntityBase<EntityType.AttachmentReference, AttachmentID> {
  mimeType: AttachmentMIMEType;
}

/**
 * @TJS-type string
 * @TJS-pattern ^[0-9a-zA-Z_\-]{22}$
 */
export type AttachmentID = string & { __attachmentIDOpaqueType: never };

export enum AttachmentMIMEType {
  PNG = "image/png",
  JPEG = "image/jpeg",
  SVG = "image/svg+xml",
}

export function getFileExtensionForAttachmentMIMEType(
  attachmentMimeType: AttachmentMIMEType,
): string;
export function getFileExtensionForAttachmentMIMEType(
  attachmentMimeType: string,
): string | null;
export function getFileExtensionForAttachmentMIMEType(
  attachmentMimeType: AttachmentMIMEType | string,
): string | null {
  switch (attachmentMimeType) {
    case AttachmentMIMEType.JPEG:
      return "jpg";
    case AttachmentMIMEType.PNG:
      return "png";
    case AttachmentMIMEType.SVG:
      return "svg";
    default:
      return null;
  }
}

// An intentionally quick and dirty mime type extractor: the libraries which map extensions to mime types are several kB.
export function getAttachmentMIMETypeForFilename(
  filename: string,
): AttachmentMIMEType | null {
  const uppercaseFilename = filename.toUpperCase();
  if (uppercaseFilename.endsWith(".PNG")) {
    return AttachmentMIMEType.PNG;
  } else if (
    uppercaseFilename.endsWith(".JPG") ||
    uppercaseFilename.endsWith(".JPEG")
  ) {
    return AttachmentMIMEType.JPEG;
  } else if (uppercaseFilename.endsWith(".SVG")) {
    return AttachmentMIMEType.SVG;
  } else {
    return null;
  }
}
