import firebase from "firebase/app";
import "firebase/firestore";

import {
  ActionLog,
  applyActionLogToPromptState,
  getIDForActionLog,
  getPromptActionLogFromActionLog,
  promptActionLogCanBeAppliedToPromptState,
  PromptState,
  PromptTaskID,
} from "metabook-core";
import {
  batchWriteEntries,
  getLogCollectionReference,
  getReferenceForActionLogID,
} from "metabook-firebase-shared";
import { getDefaultFirebaseApp } from "../../firebase";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import getPromptStates from "../getPromptStates";
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
    const userStateLogsRef = getLogCollectionReference(
      this.database,
      this.userID,
    ).orderBy(
      "timestampMillis",
      "asc",
    ) as firebase.firestore.CollectionReference<ActionLog>;

    return userStateLogsRef.onSnapshot(
      (snapshot) => {
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

  async recordActionLogs(logs: ActionLog[]): Promise<void> {
    await batchWriteEntries(
      logs.map((log) => [
        getReferenceForActionLogID(
          this.database,
          this.userID,
          getIDForActionLog(log),
        ),
        log,
      ]),
      this.database,
      (ms, ns) => new firebase.firestore.Timestamp(ms, ns),
    );
  }
}
