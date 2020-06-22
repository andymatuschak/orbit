import firestore, {
  FirebaseFirestoreTypes,
} from "@react-native-firebase/firestore";
import firebaseFunctions from "@react-native-firebase/functions";
import firebaseAuth from "@react-native-firebase/auth";
import type firebase from "firebase/app";
import { AttachmentUploader } from "metabook-client";

export function getFirestore(): firebase.firestore.Firestore {
  return (firestore() as unknown) as firebase.firestore.Firestore;
}

export function getFirebaseFunctions(): firebase.functions.Functions {
  return (firebaseFunctions() as unknown) as firebase.functions.Functions;
}

export function getFirebaseAuth(): firebase.auth.Auth {
  return (firebaseAuth() as unknown) as firebase.auth.Auth;
}

export type PersistenceStatus = "pending" | "enabled" | "unavailable";
let persistenceStatus: PersistenceStatus = "pending";
// TODO rename and rationalize this nonsense
export async function enableFirebasePersistence(): Promise<PersistenceStatus> {
  if (persistenceStatus === "pending") {
    await firestore().settings({
      persistence: false, // disable offline persistence
    } as FirebaseFirestoreTypes.Settings);
    persistenceStatus = "enabled";
  }
  return persistenceStatus;
}

export function getAttachmentUploader(): AttachmentUploader {
  return () => {
    throw new Error("Unimplemented");
  };
}
