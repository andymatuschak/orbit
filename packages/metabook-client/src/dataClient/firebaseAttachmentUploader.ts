import firebase from "firebase/app";
import "firebase/storage";
import { getFirebaseKeyForCIDString } from "metabook-firebase-support/dist/cdidEncoding";
import AttachmentUploader from "./attachmentUploader";

const attachmentBucketSubpath = "attachments";

export default function firebaseAttachmentUploader(
  storage: firebase.storage.Storage,
): AttachmentUploader {
  const attachmentPathRef = storage.ref(attachmentBucketSubpath);
  return async (attachment, attachmentID) => {
    const ref = attachmentPathRef.child(
      getFirebaseKeyForCIDString(attachmentID),
    );
    await ref.put(attachment.contents, { contentType: attachment.mimeType });
  };
}
