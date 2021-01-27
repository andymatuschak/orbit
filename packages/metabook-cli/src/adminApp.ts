import admin from "firebase-admin";
import { Attachment, AttachmentID } from "metabook-core";
import {
  getStorageObjectNameForAttachmentID,
  storageBucketName,
} from "metabook-firebase-support";
import serviceAccount from "./adminKey.json";

const useEmulator = false;

let _adminApp: admin.app.App;
export function getAdminApp() {
  if (!_adminApp) {
    if (useEmulator) {
      process.env["FIREBASE_AUTH_EMULATOR_HOST"] = "localhost:9099";
      process.env["FIRESTORE_EMULATOR_HOST"] = "localhost:8080";
    }
    _adminApp = admin.initializeApp({
      // Seems like the cert initializer has the wrong argument type.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      credential: admin.credential.cert(serviceAccount as any),
      databaseURL: "https://metabook-system.firebaseio.com",
    });
  }
  return _adminApp;
}

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
