import {
  Attachment,
  AttachmentID,
  AttachmentIDReference,
  AttachmentMimeType,
  getAttachmentMimeTypeFromResourceMetadata,
  getAttachmentTypeForAttachmentMimeType,
  getIDForAttachment,
} from "@withorbit/core";
import * as core2 from "@withorbit/core2";
import fetch, * as Fetch from "node-fetch";
import { sharedFileStorageService } from "../fileStorageService";
import * as attachments2 from "./2/attachments";
import { getFirebaseKeyForCIDString } from "./firebaseSupport";
import { getDatabase } from "./firebaseSupport/firebase";

const attachmentSizeLimitBytes = 10 * 1024 * 1024;

function getFileStorageSubpathForAttachmentID(
  attachmentID: AttachmentID,
): string {
  return `attachments/${getFirebaseKeyForCIDString(attachmentID)}`;
}

export function _validateAttachmentResponse(
  response: Fetch.Response,
  url: string,
): AttachmentMimeType | Error {
  if (response.status < 200 || response.status >= 300) {
    return new Error(`Couldn't fetch attachment at ${url}: ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type");
  const attachmentMimeType = getAttachmentMimeTypeFromResourceMetadata(
    contentType,
    url,
  );
  return (
    attachmentMimeType ??
    new Error(
      `Attachment at ${url} has unsupported content type ${contentType} and can't infer supported type from extension`,
    )
  );
}

async function _storeAttachmentFromURL(
  url: string,
): Promise<AttachmentIDReference> {
  const response = await fetch(url);

  const attachmentMimeType = _validateAttachmentResponse(response, url);
  if (attachmentMimeType instanceof Error) {
    throw attachmentMimeType;
  }

  const responseBuffer = await response.buffer();
  const attachmentType =
    getAttachmentTypeForAttachmentMimeType(attachmentMimeType);

  const { attachmentID } = await storeAttachment({
    contents: responseBuffer,
    type: attachmentType,
    mimeType: attachmentMimeType,
  });

  return {
    id: attachmentID,
    byteLength: responseBuffer.length,
    type: attachmentType,
  };
}

export async function storeAttachmentAtURLIfNecessary(
  url: string,
): Promise<AttachmentIDReference> {
  const attachmentLookupRef = getDatabase().collection("attachmentsIDsByURL");

  const records = await attachmentLookupRef.where("url", "==", url).get();
  if (records.size === 1) {
    return records.docs[0].data().idReference;
  } else if (records.size === 0) {
    const idReference = await _storeAttachmentFromURL(url);
    await attachmentLookupRef.add({ url, idReference, createdAt: Date.now() });
    return idReference;
  } else {
    throw new Error(
      `Multiple attachment lookup records matching ${url}: ${JSON.stringify(
        records.docs,
        null,
        "\t",
      )}`,
    );
  }
}

export async function storeAttachment(attachment: Attachment): Promise<{
  attachmentID: AttachmentID;
  status: "stored" | "alreadyExists";
  url: string;
}> {
  if (attachment.contents.length > attachmentSizeLimitBytes) {
    throw new Error(
      `Attachment is too large: ${attachment.contents.length}. Limit is ${attachmentSizeLimitBytes}`,
    );
  }

  const attachmentID = await getIDForAttachment(attachment.contents);

  const fileStorageService = sharedFileStorageService();
  const attachmentSubpath = getFileStorageSubpathForAttachmentID(attachmentID);
  const url = fileStorageService.formatURL(attachmentSubpath);
  if (await fileStorageService.fileExists(attachmentSubpath)) {
    return { attachmentID, status: "alreadyExists", url };
  } else {
    await fileStorageService.storeFile(
      attachmentSubpath,
      attachment.contents,
      attachment.mimeType,
    );
    return { attachmentID, status: "stored", url };
  }
}

export function getAttachmentURL(attachmentID: AttachmentID): string {
  return sharedFileStorageService().formatURL(
    getFileStorageSubpathForAttachmentID(attachmentID),
  );
}

export async function migrateAttachmentIDs(
  userID: string,
  oldAttachmentIDs: AttachmentID[],
) {
  const fileStorageService = sharedFileStorageService();
  for (const attachmentID of oldAttachmentIDs) {
    const newSubpath = attachments2.getFileStorageSubpathForAttachmentID(
      userID,
      core2.migration.convertCore1ID(attachmentID),
    );
    if (!(await fileStorageService.fileExists(newSubpath))) {
      await fileStorageService.copyFile(
        getFileStorageSubpathForAttachmentID(attachmentID),
        newSubpath,
      );
    }
  }
}

export async function getAttachmentMIMEType(
  attachmentID: AttachmentID,
): Promise<core2.AttachmentMIMEType | null> {
  const fileStorageService = sharedFileStorageService();
  const mimeTypeString = await fileStorageService.getMIMEType(
    getFileStorageSubpathForAttachmentID(attachmentID),
  );
  // TODO: validate attachment MIME type
  return mimeTypeString as core2.AttachmentMIMEType | null;
}
