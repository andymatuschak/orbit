import firebase from "firebase/app";
import { Attachment, PromptSpec } from "metabook-core";

let _app: firebase.app.App | null;
export function getDefaultFirebaseApp(): firebase.app.App {
  if (!_app) {
    _app = firebase.initializeApp({
      // TODO
    });
  }
  return _app;
}

export function getDataCollectionReference(
  database: firebase.firestore.Firestore,
): firebase.firestore.CollectionReference<PromptSpec | Attachment> {
  return database.collection("data") as firebase.firestore.CollectionReference<
    PromptSpec | Attachment
  >;
}
