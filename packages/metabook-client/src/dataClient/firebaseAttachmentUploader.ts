import firebase from "firebase/app";
import "firebase/storage";
import {
  getFirebaseKeyForCIDString,
  storageAttachmentsPathComponent,
} from "metabook-firebase-support";
import AttachmentUploader from "./attachmentUploader";

export default function firebaseAttachmentUploader(
  storage: firebase.storage.Storage,
): AttachmentUploader {
  const attachmentPathRef = storage.ref(storageAttachmentsPathComponent);
  return async (attachment, attachmentID) => {
    const ref = attachmentPathRef.child(
      getFirebaseKeyForCIDString(attachmentID),
    );
    await ref.put(attachment.contents, { contentType: attachment.mimeType });
  };
}
