// Web implementation of Firebase interface; see firebase.native.ts for native implementation.

import type firebase from "firebase/app";
import {
  AttachmentUploader,
  firebaseAttachmentUploader,
  getDefaultFirebaseApp,
} from "metabook-client";
import serviceConfig from "../../serviceConfig";

let _firestore: firebase.firestore.Firestore | null = null;
export function getFirestore(): firebase.firestore.Firestore {
  if (!_firestore) {
    _firestore = getDefaultFirebaseApp().firestore();
    if (serviceConfig.shouldUseLocalBackend) {
      _firestore.useEmulator("localhost", 8080);
    }
  }
  return _firestore;
}

let _functions: firebase.functions.Functions | null = null;
export function getFirebaseFunctions(): firebase.functions.Functions {
  if (!_functions) {
    _functions = getDefaultFirebaseApp().functions();
    if (serviceConfig.shouldUseLocalBackend) {
      _functions.useEmulator("localhost", 5001);
    }
  }
  return _functions;
}

let _auth: firebase.auth.Auth | null = null;
export function getFirebaseAuth(): firebase.auth.Auth {
  if (!_auth) {
    _auth = getDefaultFirebaseApp().auth();
    if (serviceConfig.shouldUseLocalBackend) {
      _auth.useEmulator("http://localhost:9099/");
    }
  }
  return _auth;
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
