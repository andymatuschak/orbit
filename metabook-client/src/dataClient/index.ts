import firebase from "firebase";
import "firebase/firestore";
import "firebase/functions";

import { PromptData } from "metabook-core";
import { getDataCollectionReference, getDefaultFirebaseApp } from "../firebase";
import { MetabookUnsubscribe } from "../types/unsubscribe";

export interface MetabookDataClient {
  recordData(promptData: PromptData[]): Promise<unknown>;

  getData(
    requestedPromptIDs: Set<string>,
    onUpdate: (snapshot: MetabookPromptDataSnapshot) => void,
  ): { completion: Promise<unknown>; unsubscribe: MetabookUnsubscribe };
}

interface MetabookPromptDataSnapshot {
  [key: string]: PromptData | Error | null; // null means the card data has not yet been fetched.
}

export class MetabookFirebaseDataClient implements MetabookDataClient {
  private functions: firebase.functions.Functions;
  private database: firebase.firestore.Firestore;

  constructor(app: firebase.app.App = getDefaultFirebaseApp()) {
    this.database = app.firestore();
    this.functions = app.functions();
  }

  recordData(prompts: PromptData[]): Promise<unknown> {
    return this.functions.httpsCallable("recordData")({ prompts });
  }

  getData(
    requestedPromptIDs: Set<string>,
    onUpdate: (snapshot: MetabookPromptDataSnapshot) => void,
  ): { completion: Promise<unknown>; unsubscribe: MetabookUnsubscribe } {
    const dataRef = getDataCollectionReference(this.database);
    const dataSnapshot: MetabookPromptDataSnapshot = {};

    let isCancelled = false;

    function onFetch(promptID: string, result: PromptData | Error) {
      dataSnapshot[promptID] = result;
      if (!isCancelled) {
        onUpdate(dataSnapshot);
      }
    }

    const fetchPromises = [...requestedPromptIDs.values()].map(
      async promptID => {
        try {
          const cachedData = await dataRef
            .doc(promptID)
            .get({ source: "cache" });
          onFetch(promptID, cachedData.data()!);
        } catch (error) {
          // No cached data available.
          if (!isCancelled) {
            try {
              const cachedData = await dataRef.doc(promptID).get();
              onFetch(promptID, cachedData.data()!);
            } catch (error) {
              onFetch(promptID, error);
            }
          }
        }
      },
    );

    return {
      completion: Promise.all(fetchPromises),
      unsubscribe: () => {
        isCancelled = true;
      },
    };
  }
}
