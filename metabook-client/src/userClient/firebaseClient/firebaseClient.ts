import firebase from "firebase/app";
import "firebase/firestore";

import {
  ActionLog,
  applyActionLogToPromptState,
  getPromptActionLogFromActionLog,
  PromptState,
  PromptTaskID,
} from "metabook-core";
import { getDefaultFirebaseApp } from "../../firebase";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import getPromptStates from "../getPromptStates";
import promptActionLogCanBeAppliedToPromptState from "../promptActionLogCanBeAppliedToPromptState";
import {
  MetabookCardStateQuery,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "../userClient";

export class MetabookFirebaseUserClient implements MetabookUserClient {
  userID: string;
  private database: firebase.firestore.Firestore;
  private readonly promptStateCache: Map<PromptTaskID, PromptState>;

  constructor(app: firebase.app.App = getDefaultFirebaseApp(), userID: string) {
    this.userID = userID;
    this.database = app.firestore();
    this.promptStateCache = new Map();
  }

  async getPromptStates(
    query: MetabookCardStateQuery,
  ): Promise<MetabookPromptStateSnapshot> {
    return getPromptStates(this, query);
  }

  subscribeToPromptStates(
    query: MetabookCardStateQuery,
    onCardStatesDidUpdate: (newCardStates: MetabookPromptStateSnapshot) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe {
    // TODO: handle in-memory card state records...
    const userStateLogsRef = this.getActionLogReference(this.userID).orderBy(
      "timestampMillis",
      "desc",
    );

    return userStateLogsRef.onSnapshot(
      (snapshot) => {
        console.log("Got snapshot", snapshot.docChanges());
        for (const change of snapshot.docChanges()) {
          if (change.type === "added") {
            this.updateCacheForLog(change.doc.data());
          } else {
            // TODO make more robust against client failures to persist / sync
            throw new Error(
              `Log entries should never disappear. Unsupported change type ${
                change.type
              } with doc ${change.doc.data()}`,
            );
          }
        }
        onCardStatesDidUpdate(new Map(this.promptStateCache));
      },
      (error: Error) => {
        onError(error);
      },
    );
  }

  private updateCacheForLog(log: ActionLog): void {
    const promptActionLog = getPromptActionLogFromActionLog(log);
    const cachedPromptState =
      this.promptStateCache.get(promptActionLog.taskID) ?? null;
    if (
      promptActionLogCanBeAppliedToPromptState(
        promptActionLog,
        cachedPromptState,
      )
    ) {
      const newPromptState = applyActionLogToPromptState({
        promptActionLog,
        basePromptState: cachedPromptState,
        schedule: "default",
      });
      if (newPromptState instanceof Error) {
        throw newPromptState;
      }
      this.promptStateCache.set(promptActionLog.taskID, newPromptState);
    } else {
      throw new Error(
        `Unsupported prompt log addition. New log heads: ${JSON.stringify(
          log,
          null,
          "\t",
        )}. Cached prompt state: ${JSON.stringify(
          cachedPromptState,
          null,
          "\t",
        )}`,
      );
    }
  }

  recordActionLogs(logs: ActionLog[]): Promise<unknown> {
    console.log("recording", logs);
    const userStateLogsRef = this.getActionLogReference(this.userID);
    const batch = this.database.batch();
    for (const log of logs) {
      const newDoc = userStateLogsRef.doc();
      batch.set(newDoc, log);
    }
    return batch.commit();
  }

  private getActionLogReference(
    userID: string,
  ): firebase.firestore.CollectionReference<ActionLog> {
    // TODO validate
    return this.database.collection(
      `users/${userID}/logs`,
    ) as firebase.firestore.CollectionReference<ActionLog>;
  }
}
