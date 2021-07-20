import { File as GCSFile } from "@google-cloud/storage";
import {
  Attachment,
  AttachmentID,
  AttachmentIDReference,
  AttachmentMimeType,
  getAttachmentMimeTypeFromResourceMetadata,
  getAttachmentTypeForAttachmentMimeType,
  getIDForAttachment,
} from "@withorbit/core";
import fetch, * as Fetch from "node-fetch";
import { getApp, getDatabase } from "./firebase";
import { getFirebaseKeyForCIDString } from "./firebaseSupport";

const attachmentSizeLimitBytes = 10 * 1024 * 1024;

export const storageBucketName = "metabook-system.appspot.com";
export const storageAttachmentsPathComponent = "attachments";

export function getStorageObjectNameForAttachmentID(
  attachmentID: AttachmentID,
): string {
  return `${storageAttachmentsPathComponent}/${getFirebaseKeyForCIDString(
    attachmentID,
  )}`;
}

function _getFileReferenceForAttachmentID(attachmentID: AttachmentID): GCSFile {
  return getApp()
    .storage()
    .bucket(storageBucketName)
    .file(getStorageObjectNameForAttachmentID(attachmentID));
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
  const url = getAttachmentURL(attachmentID);

  const fileRef = _getFileReferenceForAttachmentID(attachmentID);
  const [exists] = await fileRef.exists();
  if (exists) {
    return { attachmentID, status: "alreadyExists", url };
  } else {
    await fileRef.save(attachment, {
      contentType: undefined,
      public: true,
    });
    await fileRef.setMetadata({
      cacheControl: "public, max-age=604800, immutable",
    });
    return { attachmentID, status: "stored", url };
  }
}

export function getAttachmentURL(attachmentID: AttachmentID): string {
  return `https://storage.googleapis.com/${storageBucketName}/${storageAttachmentsPathComponent}/${getFirebaseKeyForCIDString(
    attachmentID,
  )}`;
}
