import { AttachmentID } from "metabook-core";
import { getFirebaseKeyForCIDString } from "./cdidEncoding";

export const storageBucketName = "metabook-system.appspot.com";
export const storageAttachmentsPathComponent = "attachments";

export function getStorageObjectNameForAttachmentID(
  attachmentID: AttachmentID,
): string {
  return `${storageAttachmentsPathComponent}/${getFirebaseKeyForCIDString(
    attachmentID,
  )}`;
}
