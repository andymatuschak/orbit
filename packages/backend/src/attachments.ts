import {
  AttachmentID,
  AttachmentMIMEType,
  getAttachmentMIMETypeForFilename,
  getFileExtensionForAttachmentMIMEType,
} from "@withorbit/core";
import URL from "url";
import { sharedFileStorageService } from "./fileStorageService/index.js";
import { FileStorageResolution } from "./fileStorageService/fileStorageService.js";

const attachmentSizeLimitBytes = 10 * 1024 * 1024;

function getFileStorageSubpathForAttachmentID(
  userID: string,
  attachmentID: AttachmentID,
): string {
  return `attachments/${userID}/${attachmentID}`;
}

export function _getAttachmentMIMETypeFromResourceMetadata(
  contentType: string | null,
  urlString: string | null,
): AttachmentMIMEType | null {
  // Our quick way to validate MIME types is with our extension lookup table.
  const attachmentExtension =
    contentType && getFileExtensionForAttachmentMIMEType(contentType);
  if (attachmentExtension) {
    return contentType as AttachmentMIMEType;
  } else if (urlString) {
    const url = new URL.URL(urlString);
    return getAttachmentMIMETypeForFilename(url.pathname);
  } else {
    return null;
  }
}

export function _validateAttachmentResponse(
  response: Response,
  url: string,
): AttachmentMIMEType | Error {
  if (response.status < 200 || response.status >= 300) {
    return new Error(`Couldn't fetch attachment at ${url}: ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type");
  const attachmentMimeType = _getAttachmentMIMETypeFromResourceMetadata(
    contentType,
    url,
  ) as AttachmentMIMEType | null; // TODO: re-implement in core
  return (
    attachmentMimeType ??
    new Error(
      `Attachment at ${url} has unsupported content type ${contentType} and can't infer supported type from extension`,
    )
  );
}

export async function storeAttachmentAtURLIfNecessary(
  userID: string,
  id: AttachmentID,
  url: string,
): Promise<{
  status: "stored" | "alreadyExists";
  mimeType: AttachmentMIMEType;
}> {
  const fileStorageService = sharedFileStorageService();
  const existingMIMEType = await fileStorageService.getMIMEType(
    getFileStorageSubpathForAttachmentID(userID, id),
  );
  if (existingMIMEType) {
    return {
      mimeType: existingMIMEType as AttachmentMIMEType,
      status: "alreadyExists",
    };
  } else {
    const response = await fetch(url);

    const mimeType = _validateAttachmentResponse(response, url);
    if (mimeType instanceof Error) {
      throw mimeType;
    }

    const contents = await response.arrayBuffer();
    await storeAttachment(userID, id, new Uint8Array(contents), mimeType);
    return { mimeType, status: "stored" };
  }
}

export async function storeAttachment(
  userID: string,
  id: AttachmentID,
  contents: Uint8Array,
  mimeType: AttachmentMIMEType,
): Promise<{
  status: "stored" | "alreadyExists";
  url: string;
}> {
  if (contents.length > attachmentSizeLimitBytes) {
    throw new Error(
      `Attachment is too large: ${contents.length}. Limit is ${attachmentSizeLimitBytes}`,
    );
  }

  const fileStorageService = sharedFileStorageService();
  const attachmentSubpath = getFileStorageSubpathForAttachmentID(userID, id);
  const url = fileStorageService.formatURL(attachmentSubpath);
  if (await fileStorageService.fileExists(attachmentSubpath)) {
    return { status: "alreadyExists", url };
  } else {
    await fileStorageService.storeFile(attachmentSubpath, contents, mimeType);
    return { status: "stored", url };
  }
}

export function resolveAttachment(
  attachmentID: AttachmentID,
  userID: string,
): Promise<FileStorageResolution | null> {
  return sharedFileStorageService().resolveFile(
    getFileStorageSubpathForAttachmentID(userID, attachmentID),
  );
}
