import { ActionLogID, Prompt, PromptID } from "@withorbit/core";
import { firestore } from "firebase-admin";
import { ActionLogDocument } from "./actionLogDocument";
import {
  getFirebaseKeyForCIDString,
  getFirebaseKeyFromStringHash,
} from "./firebaseKeyEncoding";
import { PromptStateCache } from "./promptStateCache";
import { UserMetadata } from "./userMetadata";

function getPromptCollectionReference(
  database: firestore.Firestore,
): firestore.CollectionReference<Prompt> {
  return database.collection("data") as firestore.CollectionReference<Prompt>;
}

export function getUserMetadataReference(
  database: firestore.Firestore,
  userID: string,
): firestore.DocumentReference<UserMetadata> {
  return database.doc(
    `users/${userID}`,
  ) as firestore.DocumentReference<UserMetadata>;
}

export function getPromptReference(
  database: firestore.Firestore,
  promptID: PromptID,
): firestore.DocumentReference<Prompt> {
  const dataReference = getPromptCollectionReference(database);
  return dataReference.doc(
    getFirebaseKeyForCIDString(promptID),
  ) as firestore.DocumentReference<Prompt>;
}

export function getLogCollectionReference(
  database: firestore.Firestore,
  userID: string,
): firestore.CollectionReference<ActionLogDocument> {
  return database.collection(
    `users/${userID}/logs`,
  ) as firestore.CollectionReference<ActionLogDocument>;
}

export function getTaskStateCacheCollectionReference(
  database: firestore.Firestore,
  userID: string,
): firestore.CollectionReference<PromptStateCache> {
  return database.collection(
    `users/${userID}/taskStates`,
  ) as firestore.CollectionReference<PromptStateCache>;
}

export function getTaskStateCacheReference(
  database: firestore.Firestore,
  userID: string,
  taskID: string,
): firestore.DocumentReference<PromptStateCache> {
  return getTaskStateCacheCollectionReference(database, userID).doc(
    getFirebaseKeyFromStringHash(taskID),
  ) as firestore.DocumentReference<PromptStateCache>;
}

export function getActionLogIDReference(
  database: firestore.Firestore,
  userID: string,
  actionLogID: ActionLogID,
): firestore.DocumentReference<ActionLogDocument> {
  return getLogCollectionReference(database, userID).doc(
    getFirebaseKeyForCIDString(actionLogID),
  ) as firestore.DocumentReference<ActionLogDocument>;
}
