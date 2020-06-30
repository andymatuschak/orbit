import { Buffer } from "buffer";
import {
  AttachmentID,
  AttachmentMimeType,
  getAttachmentMimeTypeFromResourceMetadata,
  getIDForAttachment,
} from "metabook-core";
import {
  getAttachmentIDForFirebaseKey,
  getStorageObjectNameForAttachmentID,
  storageAttachmentsPathComponent,
  storageBucketName,
} from "metabook-firebase-support";
import fetch, * as Fetch from "node-fetch";
import { getApp } from "./firebase";

function getAttachmentBucket() {
  return getApp().storage().bucket(storageBucketName);
}

export function _validateAttachmentDataFromReadStream(
  readStream: NodeJS.ReadableStream,
  claimedAttachmentID: AttachmentID,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readStream.on("error", reject);
    readStream.on("end", async () => {
      const buffer = Buffer.concat(chunks);
      const computedAttachmentID = await getIDForAttachment(buffer);
      if (computedAttachmentID === claimedAttachmentID) {
        resolve();
      } else {
        reject(
          new Error(
            `Attachment does not match claimed hash ${claimedAttachmentID}: make sure its contents do not change over time`,
          ),
        );
      }
    });
    readStream.on("data", (chunk: Buffer) => chunks.push(chunk));
  });
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

async function _storeFetchedAttachment(
  responseBody: NodeJS.ReadableStream,
  contentType: AttachmentMimeType,
  attachmentID: AttachmentID,
) {
  const file = _getFileReferenceForAttachmentID(attachmentID);
  const writeStream = file.createWriteStream({
    contentType,
  });
  return new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    responseBody.pipe(writeStream);
  });
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
  attachmentID: AttachmentID,
) {
  const response = await fetch(url);

  const attachmentMimeType = _validateAttachmentResponse(response, url);
  if (attachmentMimeType instanceof Error) {
    throw attachmentMimeType;
  }

  // We'll validate the attachment before storing it, even though we have a storage trigger which validates attachments. This way we can return a transacational result to the client and tell them whether everything's OK immediately.
  const responseForStoring = response.clone();
  await _validateAttachmentDataFromReadStream(response.body, attachmentID);
  await _storeFetchedAttachment(
    responseForStoring.body,
    attachmentMimeType,
    attachmentID,
  );
  console.log(`Stored attachment ${attachmentID}`);
}

export async function storeAttachmentIfNecessary(
  attachmentID: AttachmentID,
  url: string,
) {
  const file = _getFileReferenceForAttachmentID(attachmentID);
  const attachmentExists = (await file.exists())[0];
  if (!attachmentExists) {
    console.log(`Storing missing attachment ${attachmentID} at ${url}`);
    return await _storeAttachmentFromURL(url, attachmentID);
  }
}
