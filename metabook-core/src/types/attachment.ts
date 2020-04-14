import { AttachmentType } from "./attachmentType";

export interface Attachment {
  type: AttachmentType;
  mimeType: AttachmentMimeType;
  contents: string;
}

export enum AttachmentMimeType {
  PNG = "image/png",
  JPEG = "image/jpeg",
}

// An intentionally quick and dirty mime type extractor: the libraries which map extensions to mime types are several kB.
export function getAttachmentMimeTypeForFilename(
  filename: string,
): AttachmentMimeType | null {
  if (filename.endsWith(".png")) {
    return AttachmentMimeType.PNG;
  } else if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return AttachmentMimeType.JPEG;
  } else {
    return null;
  }
}

export function getFileExtensionForAttachmentMimeType(
  attachmentMimeType: AttachmentMimeType,
): string | null {
  switch (attachmentMimeType) {
    case AttachmentMimeType.JPEG:
      return "jpg";
    case AttachmentMimeType.PNG:
      return "png";
    default:
      return null;
  }
}
