import { ActionLogID, Prompt, PromptID } from "@withorbit/core";
import firebase from "firebase-admin";
import { ActionLogDocument } from "./actionLogDocument";
import {
  getFirebaseKeyForCIDString,
  getFirebaseKeyFromStringHash,
} from "./firebaseKeyEncoding";
import { PromptStateCache } from "./promptStateCache";
import { UserMetadata } from "./userMetadata";

function getPromptCollectionReference(
  database: firebase.firestore.Firestore,
): firebase.firestore.CollectionReference<Prompt> {
  return database.collection(
    "data",
  ) as firebase.firestore.CollectionReference<Prompt>;
}

export function getUserMetadataReference(
  database: firebase.firestore.Firestore,
  userID: string,
): firebase.firestore.DocumentReference<UserMetadata> {
  return database.doc(
    `users/${userID}`,
  ) as firebase.firestore.DocumentReference<UserMetadata>;
}

export function getPromptReference(
  database: firebase.firestore.Firestore,
  promptID: PromptID,
): firebase.firestore.DocumentReference<Prompt> {
  const dataReference = getPromptCollectionReference(database);
  return dataReference.doc(
    getFirebaseKeyForCIDString(promptID),
  ) as firebase.firestore.DocumentReference<Prompt>;
}

export function getLogCollectionReference(
  database: firebase.firestore.Firestore,
  userID: string,
): firebase.firestore.CollectionReference<ActionLogDocument> {
  return database.collection(
    `users/${userID}/logs`,
  ) as firebase.firestore.CollectionReference<ActionLogDocument>;
}

export function getTaskStateCacheCollectionReference(
  database: firebase.firestore.Firestore,
  userID: string,
): firebase.firestore.CollectionReference<PromptStateCache> {
  return database.collection(
    `users/${userID}/taskStates`,
  ) as firebase.firestore.CollectionReference<PromptStateCache>;
}

export function getTaskStateCacheReference(
  database: firebase.firestore.Firestore,
  userID: string,
  taskID: string,
): firebase.firestore.DocumentReference<PromptStateCache> {
  return getTaskStateCacheCollectionReference(database, userID).doc(
    getFirebaseKeyFromStringHash(taskID),
  ) as firebase.firestore.DocumentReference<PromptStateCache>;
}

export function getActionLogIDReference(
  database: firebase.firestore.Firestore,
  userID: string,
  actionLogID: ActionLogID,
): firebase.firestore.DocumentReference<ActionLogDocument> {
  return getLogCollectionReference(database, userID).doc(
    getFirebaseKeyForCIDString(actionLogID),
  ) as firebase.firestore.DocumentReference<ActionLogDocument>;
}
