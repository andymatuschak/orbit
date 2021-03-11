import { AttachmentID } from "@withorbit/core";
import { getFirebaseKeyForCIDString } from "./firebaseKeyEncoding.js";

export const storageBucketName = "metabook-system.appspot.com";
export const storageAttachmentsPathComponent = "attachments";

export function getStorageObjectNameForAttachmentID(
  attachmentID: AttachmentID,
): string {
  return `${storageAttachmentsPathComponent}/${getFirebaseKeyForCIDString(
    attachmentID,
  )}`;
}

export function getAttachmentURL(attachmentID: AttachmentID): string {
  return `https://storage.googleapis.com/${storageBucketName}/${storageAttachmentsPathComponent}/${getFirebaseKeyForCIDString(
    attachmentID,
  )}`;
}
