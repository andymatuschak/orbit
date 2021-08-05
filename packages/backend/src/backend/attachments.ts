import {
  Attachment,
  AttachmentID,
  AttachmentIDReference,
  AttachmentMimeType,
  getAttachmentMimeTypeFromResourceMetadata,
  getAttachmentTypeForAttachmentMimeType,
  getIDForAttachment,
} from "@withorbit/core";
import { AttachmentMIMEType } from "@withorbit/core2";
import fetch, * as Fetch from "node-fetch";
import { sharedFileStorageService } from "../fileStorageService";
import { getFirebaseKeyForCIDString } from "./firebaseSupport";
import { getDatabase } from "./firebaseSupport/firebase";

const attachmentSizeLimitBytes = 10 * 1024 * 1024;

export type AttachmentAPIVersion = "core" | "core2";

function getFileStorageSubpathForAttachmentID(
  attachmentID: AttachmentID,
  userID: string | null,
  version: AttachmentAPIVersion,
): string {
  switch (version) {
    case "core":
      return `${getFirebaseKeyForCIDString(attachmentID)}`;
    case "core2":
      if (userID === null) {
        throw new Error(`userID is required in core2 attachment API`);
      }
      return `${userID}/${attachmentID}`;
  }
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
  userID: string | null,
  version: AttachmentAPIVersion,
): Promise<AttachmentIDReference> {
  const response = await fetch(url);

  const attachmentMimeType = _validateAttachmentResponse(response, url);
  if (attachmentMimeType instanceof Error) {
    throw attachmentMimeType;
  }

  const responseBuffer = await response.buffer();
  const attachmentType =
    getAttachmentTypeForAttachmentMimeType(attachmentMimeType);

  const { attachmentID } = await storeAttachment(
    {
      contents: responseBuffer,
      type: attachmentType,
      mimeType: attachmentMimeType,
    },
    userID,
    version,
  );

  return {
    id: attachmentID,
    byteLength: responseBuffer.length,
    type: attachmentType,
  };
}

export async function storeAttachmentAtURLIfNecessary(
  url: string,
  userID: string | null,
  version: AttachmentAPIVersion,
): Promise<AttachmentIDReference> {
  const attachmentLookupRef = getDatabase().collection("attachmentsIDsByURL");

  const records = await attachmentLookupRef.where("url", "==", url).get();
  if (records.size === 1) {
    return records.docs[0].data().idReference;
  } else if (records.size === 0) {
    const idReference = await _storeAttachmentFromURL(url, userID, version);
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

export async function storeAttachment(
  attachment: Attachment,
  userID: string | null,
  version: AttachmentAPIVersion,
): Promise<{
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
  const attachmentSubpath = getFileStorageSubpathForAttachmentID(
    attachmentID,
    userID,
    version,
  );
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

export function getAttachmentURL(
  attachmentID: AttachmentID,
  userID: string | null,
  version: AttachmentAPIVersion,
): string {
  return sharedFileStorageService().formatURL(
    getFileStorageSubpathForAttachmentID(attachmentID, userID, version),
  );
}

export async function migrateAttachmentIDs(
  attachmentIDs: AttachmentID[],
  userID: string,
) {
  const fileStorageService = sharedFileStorageService();
  for (const attachmentID of attachmentIDs) {
    const newSubpath = getFileStorageSubpathForAttachmentID(
      attachmentID,
      userID,
      "core2",
    );
    if (!(await fileStorageService.fileExists(newSubpath))) {
      await fileStorageService.copyFile(
        getFileStorageSubpathForAttachmentID(attachmentID, null, "core"),
        newSubpath,
      );
    }
  }
}

export async function getAttachmentMIMEType(attachmentID: AttachmentID, userID: string, version: AttachmentAPIVersion): Promise<AttachmentMIMEType | null> {
  const fileStorageService = sharedFileStorageService();
  const mimeTypeString = await fileStorageService.getMIMEType(getFileStorageSubpathForAttachmentID(attachmentID, userID, version));
  // TODO: validate attachment MIME type
  return mimeTypeString as AttachmentMIMEType | null;
}
