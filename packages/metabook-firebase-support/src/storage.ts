import { AttachmentID } from "metabook-core";
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
