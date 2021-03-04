import { Buffer } from "buffer";
import {
  Attachment,
  AttachmentID,
  AttachmentIDReference,
  AttachmentMimeType,
  getAttachmentMimeTypeFromResourceMetadata,
  getAttachmentTypeForAttachmentMimeType,
  getIDForAttachment,
} from "metabook-core";
import {
  getAttachmentIDForFirebaseKey,
  getAttachmentURL as _getAttachmentURL,
  getStorageObjectNameForAttachmentID,
  storageAttachmentsPathComponent,
  storageBucketName,
} from "metabook-firebase-support";
import fetch, * as Fetch from "node-fetch";
import { getApp, getDatabase } from "./firebase";

const attachmentSizeLimitBytes = 10 * 1024 * 1024;

function getAttachmentBucket() {
  return getApp().storage().bucket(storageBucketName);
}

export function _computeAttachmentIDFromReadStream(
  readStream: NodeJS.ReadableStream,
): Promise<AttachmentID> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readStream.on("error", reject);
    readStream.on("end", async () => {
      const buffer = Buffer.concat(chunks);
      const computedAttachmentID = await getIDForAttachment(buffer);
      resolve(computedAttachmentID);
    });
    readStream.on("data", (chunk: Buffer) => chunks.push(chunk));
  });
}

export async function _validateAttachmentDataFromReadStream(
  readStream: NodeJS.ReadableStream,
  claimedAttachmentID: AttachmentID,
): Promise<void> {
  const attachmentID = await _computeAttachmentIDFromReadStream(readStream);
  if (claimedAttachmentID !== attachmentID) {
    throw new Error(
      `Attachment does not match claimed hash ${claimedAttachmentID}: make sure its contents do not change over time`,
    );
  }
}

export function _getAttachmentIDForStoredObjectName(objectName: string) {
  return getAttachmentIDForFirebaseKey(
    objectName.slice(storageAttachmentsPathComponent.length + 1),
  );
}

export async function _validateStoredAttachment(
  readStream: NodeJS.ReadableStream,
  contentType: string | null,
  claimedAttachmentID: AttachmentID,
): Promise<void> {
  if (!getAttachmentMimeTypeFromResourceMetadata(contentType ?? null, null)) {
    throw new Error(
      `Attachment has invalid or missing content type ${contentType}`,
    );
  }

  await _validateAttachmentDataFromReadStream(readStream, claimedAttachmentID);
}

// When attachments are uploaded, we check them to make sure they match their named ID. Then we make them publicly accessible.
export async function validateAndFinalizeAttachmentWithObjectName(
  objectName: string,
  contentType: string | null,
): Promise<void> {
  const claimedAttachmentID = _getAttachmentIDForStoredObjectName(objectName);
  console.log(`Checking attachment at ${objectName}: ${claimedAttachmentID}`);

  const file = getAttachmentBucket().file(objectName);
  try {
    await _validateStoredAttachment(
      file.createReadStream(),
      contentType,
      claimedAttachmentID,
    );

    console.log("Attachment is valid");
    await file.setMetadata({
      cacheControl: "public, max-age=604800, immutable",
    });
    await file.makePublic();
  } catch (error) {
    console.error(error);
    await file.delete();
  }
}

function _getFileReferenceForAttachmentID(attachmentID: AttachmentID) {
  return getAttachmentBucket().file(
    getStorageObjectNameForAttachmentID(attachmentID),
  );
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
  if (responseBuffer.length > attachmentSizeLimitBytes) {
    throw new Error(
      `Attachment at ${url} is too large: ${responseBuffer.length}. Limit is ${attachmentSizeLimitBytes}`,
    );
  }

  const attachmentID = await getIDForAttachment(responseBuffer);
  await _getFileReferenceForAttachmentID(attachmentID).save(responseBuffer, {
    contentType: attachmentMimeType,
  });

  return {
    id: attachmentID,
    byteLength: responseBuffer.length,
    type: getAttachmentTypeForAttachmentMimeType(attachmentMimeType),
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

export async function storeAttachment(
  attachment: Attachment,
): Promise<{
  attachmentID: AttachmentID;
  status: "stored" | "alreadyExists";
  url: string;
}> {
  const attachmentID = await getIDForAttachment(attachment.contents);
  const url = getAttachmentURL(attachmentID);

  const fileRef = _getFileReferenceForAttachmentID(attachmentID);
  const [exists] = await fileRef.exists();
  if (exists) {
    return { attachmentID, status: "alreadyExists", url };
  } else {
    await fileRef.save(attachment.contents, {
      contentType: attachment.mimeType,
    });
    // TODO: move validation / metadata bits here.
    return { attachmentID, status: "stored", url };
  }
}

export function getAttachmentURL(attachmentID: AttachmentID): string {
  return _getAttachmentURL(attachmentID);
}
