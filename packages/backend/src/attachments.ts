import { getAttachmentMimeTypeFromResourceMetadata } from "@withorbit/core";
import { AttachmentID, AttachmentMIMEType } from "@withorbit/core2";
import fetch, * as Fetch from "node-fetch";
import { sharedFileStorageService } from "./fileStorageService";
import { FileStorageResolution } from "./fileStorageService/fileStorageService";

const attachmentSizeLimitBytes = 10 * 1024 * 1024;

function getFileStorageSubpathForAttachmentID(
  userID: string,
  attachmentID: AttachmentID,
): string {
  return `attachments/${userID}/${attachmentID}`;
}

export function _validateAttachmentResponse(
  response: Fetch.Response,
  url: string,
): AttachmentMIMEType | Error {
  if (response.status < 200 || response.status >= 300) {
    return new Error(`Couldn't fetch attachment at ${url}: ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type");
  const attachmentMimeType = getAttachmentMimeTypeFromResourceMetadata(
    contentType,
    url,
  ) as AttachmentMIMEType | null; // TODO: re-implement in core2
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

    const contents = await response.buffer();
    await storeAttachment(userID, id, contents, mimeType);
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
