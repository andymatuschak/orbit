import * as firebase from "firebase";
import { PromptData } from "metabook-core";

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
): firebase.firestore.CollectionReference<PromptData> {
  return database.collection("data") as firebase.firestore.CollectionReference<
    PromptData
  >;
}
