import type firebase from "firebase/app";
import {
  AttachmentUploader,
  firebaseAttachmentUploader,
  getDefaultFirebaseApp,
} from "metabook-client";

export function getFirestore(): firebase.firestore.Firestore {
  return getDefaultFirebaseApp().firestore();
}

export function getFirebaseFunctions(): firebase.functions.Functions {
  return getDefaultFirebaseApp().functions();
}

export function getFirebaseAuth(): firebase.auth.Auth {
  return getDefaultFirebaseApp().auth();
}

export type PersistenceStatus = "pending" | "enabled" | "unavailable";
const persistenceStatus: PersistenceStatus = "pending";
// TODO rename and rationalize this nonsense
export async function enableFirebasePersistence(): Promise<PersistenceStatus> {
  try {
    await getFirestore().enablePersistence();
    return "enabled";
  } catch {
    return "unavailable";
  }
}

export function getAttachmentUploader(): AttachmentUploader {
  firebaseAttachmentUploader(getDefaultFirebaseApp().storage());
}
