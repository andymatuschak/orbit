import { ActionLogID } from "@withorbit/core";
import { ActionLogDocument } from "./actionLogDocument";
import { DataRecord, DataRecordID } from "./dataRecord";
import {
  getFirebaseKeyForCIDString,
  getFirebaseKeyForTaskID,
} from "./firebaseKeyEncoding";
import {
  CollectionReference,
  Database,
  DocumentReference,
  TimestampOf,
} from "./libraryAbstraction";
import { PromptStateCache } from "./promptStateCache";
import { UserMetadata } from "./userMetadata";

function getDataCollectionReference<D extends Database>(
  database: D,
): CollectionReference<D, DataRecord> {
  return database.collection("data") as CollectionReference<D, DataRecord>;
}

function getDataRecordReferenceForCID<D extends Database>(
  database: D,
  cidString: string,
): DocumentReference<D, DataRecord> {
  const dataReference = getDataCollectionReference(database);
  return dataReference.doc(
    getFirebaseKeyForCIDString(cidString),
  ) as DocumentReference<D, DataRecord>;
}

export function getUserMetadataReference<D extends Database>(
  database: D,
  userID: string,
): DocumentReference<D, UserMetadata> {
  return database.doc(`users/${userID}`) as DocumentReference<D, UserMetadata>;
}

export function getDataRecordReference<
  D extends Database,
  R extends DataRecord,
>(database: D, recordID: DataRecordID<R>): DocumentReference<D, R> {
  return getDataRecordReferenceForCID(database, recordID) as DocumentReference<
    D,
    R
  >;
}

export function getLogCollectionReference<D extends Database>(
  database: D,
  userID: string,
): CollectionReference<D, ActionLogDocument<TimestampOf<D>>> {
  return database.collection(`users/${userID}/logs`) as CollectionReference<
    D,
    ActionLogDocument<TimestampOf<D>>
  >;
}

export function getTaskStateCacheCollectionReference<D extends Database>(
  database: D,
  userID: string,
): CollectionReference<D, PromptStateCache> {
  return database.collection(
    `users/${userID}/taskStates`,
  ) as CollectionReference<D, PromptStateCache>;
}

export async function getTaskStateCacheReference<D extends Database>(
  database: D,
  userID: string,
  taskID: string,
): Promise<DocumentReference<D, PromptStateCache>> {
  return getTaskStateCacheCollectionReference(database, userID).doc(
    await getFirebaseKeyForTaskID(taskID),
  ) as DocumentReference<D, PromptStateCache>;
}

export function getActionLogIDReference<D extends Database>(
  database: D,
  userID: string,
  actionLogID: ActionLogID,
): DocumentReference<D, ActionLogDocument<TimestampOf<D>>> {
  return getLogCollectionReference(database, userID).doc(
    getFirebaseKeyForCIDString(actionLogID),
  ) as DocumentReference<D, ActionLogDocument<TimestampOf<D>>>;
}
