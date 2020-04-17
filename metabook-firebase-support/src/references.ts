import { ActionLogID, AttachmentID, PromptID } from "metabook-core";
import multihashes from "multihashes";
import multihashing from "multihashing";
import { getFirebaseKeyForCIDString } from "./cdidEncoding";
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

export function getReferenceForAttachmentID<D extends Database>(
  database: D,
  attachmentID: AttachmentID,
): DocumentReference<D> {
  return getReferenceForCID(database, attachmentID);
}

export function getReferenceForPromptID<D extends Database>(
  database: D,
  promptID: PromptID,
): DocumentReference<D> {
  return getReferenceForCID(database, promptID);
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

export function getTaskStateCacheReferenceForTaskID<D extends Database>(
  database: D,
  userID: string,
  taskID: string,
): DocumentReference<D> {
  // The taskID is not sharding-friendly; we hash it to get a Firebase key with a uniformly-distributed prefix.
  const hashedTaskID = multihashes.toB58String(
    multihashing.digest(taskID, "sha2-256"),
  );
  return getTaskStateCacheCollectionReference(database, userID).doc(
    hashedTaskID,
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
