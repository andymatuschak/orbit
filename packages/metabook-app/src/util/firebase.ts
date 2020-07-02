// Web implementation of Firebase interface; see firebase.native.ts for native implementation.

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
let persistenceStatus: PersistenceStatus = "pending";
// TODO rename and rationalize this nonsense
export async function enableFirebasePersistence(): Promise<PersistenceStatus> {
  if (persistenceStatus === "pending") {
    try {
      await getFirestore().enablePersistence();
      persistenceStatus = "enabled";
    } catch {
      persistenceStatus = "unavailable";
    }
  }
  return persistenceStatus;
}

export function getAttachmentUploader(): AttachmentUploader {
  return firebaseAttachmentUploader(getDefaultFirebaseApp().storage());
}
