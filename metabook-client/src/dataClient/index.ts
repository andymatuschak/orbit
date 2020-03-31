import firebase from "firebase";
import "firebase/firestore";
import "firebase/functions";

import { PromptSpec, PromptSpecID } from "metabook-core";
import { getDataCollectionReference, getDefaultFirebaseApp } from "../firebase";
import { MetabookUnsubscribe } from "../types/unsubscribe";

export interface MetabookDataClient {
  recordData(promptData: PromptSpec[]): Promise<unknown>;

  getData(
    requestedPromptIDs: Set<PromptSpecID>,
    onUpdate: (snapshot: MetabookPromptDataSnapshot) => void,
  ): { completion: Promise<unknown>; unsubscribe: MetabookUnsubscribe };
}

type MetabookPromptDataSnapshot = Map<
  PromptSpecID,
  PromptSpec | Error | null // null means the card data has not yet been fetched.
>;

export class MetabookFirebaseDataClient implements MetabookDataClient {
  private functions: firebase.functions.Functions;
  private database: firebase.firestore.Firestore;

  constructor(app: firebase.app.App = getDefaultFirebaseApp()) {
    this.database = app.firestore();
    this.functions = app.functions();
  }

  recordData(prompts: PromptSpec[]): Promise<unknown> {
    // TODO locally cache new prompts
    return this.functions.httpsCallable("recordData")({ prompts });
  }

  getData(
    requestedPromptSpecIDs: Set<PromptSpecID>,
    onUpdate: (snapshot: MetabookPromptDataSnapshot) => void,
  ): { completion: Promise<unknown>; unsubscribe: MetabookUnsubscribe } {
    const dataRef = getDataCollectionReference(this.database);

    const dataSnapshot: MetabookPromptDataSnapshot = new Map(
      [...requestedPromptSpecIDs.values()].map((promptSpecID) => [
        promptSpecID,
        null,
      ]),
    );

    let isCancelled = false;

    function onFetch(promptSpecID: PromptSpecID, result: PromptSpec | Error) {
      // TODO: Validate spec
      dataSnapshot.set(promptSpecID, result);
      if (!isCancelled) {
        onUpdate(dataSnapshot);
      }
    }

    if (requestedPromptSpecIDs.size === 0) {
      onUpdate(new Map());
      return {
        completion: Promise.resolve(),
        unsubscribe: () => {
          return;
        },
      };
    } else {
      const fetchPromises = [...requestedPromptSpecIDs.values()].map(
        async (promptSpecID) => {
          try {
            const cachedData = await dataRef
              .doc(promptSpecID)
              .get({ source: "cache" });
            onFetch(promptSpecID, cachedData.data()!);
          } catch (error) {
            // No cached data available.
            if (!isCancelled) {
              try {
                const cachedData = await dataRef.doc(promptSpecID).get();
                onFetch(promptSpecID, cachedData.data()!);
              } catch (error) {
                onFetch(promptSpecID, error);
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
}
