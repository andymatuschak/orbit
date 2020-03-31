import * as firebase from "firebase-admin";
import { getIDForPromptSpec, PromptSpec } from "metabook-core";

let _database: firebase.firestore.Firestore | null = null;
function getDatabase(): firebase.firestore.Firestore {
  if (!_database) {
    const app = firebase.initializeApp();
    _database = app.firestore();
  }
  return _database;
}

export function getDataCollectionReference(): firebase.firestore.CollectionReference<
  PromptSpec
> {
  // TODO remove duplication with metabook-client
  return getDatabase().collection(
    "data",
  ) as firebase.firestore.CollectionReference<PromptSpec>;
}

export function recordData(prompts: PromptSpec[]): Promise<string[]> {
  // TODO probably add something about provenance
  // TODO something about user quotas, billing
  const database = getDatabase();
  const collectionReference = getDataCollectionReference();
  return Promise.all(
    prompts.map(async (promptData) => {
      const id = getIDForPromptSpec(promptData);
      const dataRef = collectionReference.doc(id);
      await dataRef
        .create(promptData)
        .then(() => {
          console.log("Recorded", id, promptData);
        })
        .catch(() => {
          return;
        });
      return id;
    }),
  );
}
