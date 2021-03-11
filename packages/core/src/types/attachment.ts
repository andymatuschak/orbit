import URL from "url";
import { AttachmentID } from "./attachmentID";
import { AttachmentType, imageAttachmentType } from "./attachmentType";
import {
  applicationPromptType,
  clozePromptType,
  Prompt,
  PromptField,
  QAPromptContents,
  qaPromptType,
} from "./prompt";

export interface Attachment {
  type: AttachmentType;
  mimeType: AttachmentMimeType;
  contents: Uint8Array;
}

export enum AttachmentMimeType {
  PNG = "image/png",
  JPEG = "image/jpeg",
  SVG = "image/svg+xml",
}

// An intentionally quick and dirty mime type extractor: the libraries which map extensions to mime types are several kB.
export function getAttachmentMimeTypeForFilename(
  filename: string,
): AttachmentMimeType | null {
  const uppercaseFilename = filename.toUpperCase();
  if (uppercaseFilename.endsWith(".PNG")) {
    return AttachmentMimeType.PNG;
  } else if (
    uppercaseFilename.endsWith(".JPG") ||
    uppercaseFilename.endsWith(".JPEG")
  ) {
    return AttachmentMimeType.JPEG;
  } else if (uppercaseFilename.endsWith(".SVG")) {
    return AttachmentMimeType.SVG;
  } else {
    return null;
  }
}

export function getFileExtensionForAttachmentMimeType(
  attachmentMimeType: AttachmentMimeType,
): string;
export function getFileExtensionForAttachmentMimeType(
  attachmentMimeType: string,
): string | null;
export function getFileExtensionForAttachmentMimeType(
  attachmentMimeType: AttachmentMimeType | string,
): string | null {
  switch (attachmentMimeType) {
    case AttachmentMimeType.JPEG:
      return "jpg";
    case AttachmentMimeType.PNG:
      return "png";
    case AttachmentMimeType.SVG:
      return "svg";
    default:
      return null;
  }
}

export function getAttachmentTypeForAttachmentMimeType(
  attachmentMimeType: AttachmentMimeType,
): AttachmentType {
  switch (attachmentMimeType) {
    case AttachmentMimeType.SVG:
    case AttachmentMimeType.PNG:
    case AttachmentMimeType.JPEG:
      return imageAttachmentType;
  }
}

export function getAttachmentMimeTypeFromResourceMetadata(
  contentType: string | null,
  urlString: string | null,
): AttachmentMimeType | null {
  // Our quick way to validate MIME types is with our extension lookup table.
  const attachmentExtension =
    contentType && getFileExtensionForAttachmentMimeType(contentType);
  if (attachmentExtension) {
    return contentType as AttachmentMimeType;
  } else if (urlString) {
    const url = new URL.URL(urlString);
    return getAttachmentMimeTypeForFilename(url.pathname);
  } else {
    return null;
  }
}

export function getAttachmentIDsInPrompt(spec: Prompt): Set<AttachmentID> {
  const output = new Set<AttachmentID>();

  function visitQAPrompt(qaPrompt: QAPromptContents) {
    function visitPromptField(promptField: PromptField) {
      promptField.attachments.forEach((attachmentIDReference) =>
        output.add(attachmentIDReference.id),
      );
    }

    visitPromptField(qaPrompt.question);
    visitPromptField(qaPrompt.answer);
    if (qaPrompt.explanation) {
      visitPromptField(qaPrompt.explanation);
    }
  }

  switch (spec.promptType) {
    case qaPromptType:
      visitQAPrompt(spec);
      break;
    case applicationPromptType:
      spec.variants.forEach(visitQAPrompt);
      break;
    case clozePromptType:
      break;
  }
  return output;
}
