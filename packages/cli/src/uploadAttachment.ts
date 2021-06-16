import { Attachment, AttachmentID } from "@withorbit/core";
import {
  getStorageObjectNameForAttachmentID,
  storageBucketName,
} from "@withorbit/firebase-support";
import { getAdminApp } from "./adminApp";

export async function uploadAttachment(
  attachment: Attachment,
  attachmentID: AttachmentID,
): Promise<void> {
  const ref = getAdminApp()
    .storage()
    .bucket(storageBucketName)
    .file(getStorageObjectNameForAttachmentID(attachmentID));
  const writeStream = ref.createWriteStream({
    contentType: attachment.mimeType,
  });
  return new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    writeStream.write(attachment.contents);
    writeStream.end();
  });
}
