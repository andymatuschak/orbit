import type { firestore as ClientFirestore } from "firebase";
import type { firestore as AdminFirestore } from "firebase-admin";
import { ActionLogID, AttachmentID, PromptID } from "metabook-core";
import { getFirebaseKeyForCIDString } from "./cdidEncoding";

type Database = ClientFirestore.Firestore | AdminFirestore.Firestore;
type CollectionReference<D extends Database> = ReturnType<D["collection"]>;
type DocumentReference<D extends Database> = ReturnType<
  CollectionReference<D>["doc"]
>;

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

export function getReferenceForActionLogID<D extends Database>(
  database: D,
  userID: string,
  actionLogID: ActionLogID,
): DocumentReference<D> {
  return getLogCollectionReference(database, userID).doc(
    getFirebaseKeyForCIDString(actionLogID),
  ) as DocumentReference<D>;
}
