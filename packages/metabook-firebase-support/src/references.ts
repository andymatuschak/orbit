import { ActionLogID } from "metabook-core";
import shajs from "sha.js";
import {
  getFirebaseKeyForCIDString,
  getFirebaseKeyForTaskID,
} from "./firebaseKeyEncoding.js";
import { DataRecord, DataRecordID } from "./dataRecord";
import {
  CollectionReference,
  Database,
  DocumentReference,
} from "./libraryAbstraction";

function getDataCollectionReference<D extends Database>(
  database: D,
): CollectionReference<D> {
  return database.collection("data") as CollectionReference<D>;
}

function getReferenceForCID<D extends Database>(
  database: D,
  cidString: string,
) {
  const dataReference = getDataCollectionReference(database);
  return dataReference.doc(
    getFirebaseKeyForCIDString(cidString),
  ) as DocumentReference<D>;
}

export function getReferenceForDataRecordID<
  D extends Database,
  R extends DataRecord
>(database: D, recordID: DataRecordID<R>): DocumentReference<D> {
  return getReferenceForCID(database, recordID);
}

export function getLogCollectionReference<D extends Database>(
  database: D,
  userID: string,
): CollectionReference<D> {
  return database.collection(`users/${userID}/logs`) as CollectionReference<D>;
}

export function getTaskStateCacheCollectionReference<D extends Database>(
  database: D,
  userID: string,
): CollectionReference<D> {
  return database.collection(
    `users/${userID}/taskStates`,
  ) as CollectionReference<D>;
}

export async function getTaskStateCacheReferenceForTaskID<D extends Database>(
  database: D,
  userID: string,
  taskID: string,
): Promise<DocumentReference<D>> {
  return getTaskStateCacheCollectionReference(database, userID).doc(
    await getFirebaseKeyForTaskID(taskID),
  ) as DocumentReference<D>;
}

export function getReferenceForActionLogID<D extends Database>(
  database: D,
  userID: string,
  actionLogID: ActionLogID,
): DocumentReference<D> {
  return getLogCollectionReference(database, userID).doc(
    getFirebaseKeyForCIDString(actionLogID),
  ) as DocumentReference<D>;
}
