import firebase from "firebase/app";
import "firebase/firestore";

import { encodePromptID, PromptState } from "metabook-core";
import { EncodedPromptID } from "metabook-core/dist/promptID";
import { getDefaultFirebaseApp } from "../../firebase";
import { MetabookActionLog } from "../../types/actionLog";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import { getActionLogForAction } from "../../util/getActionLogForAction";
import { getNextPromptStateForActionLog } from "../../util/getNextPromptStateForActionLog";
import { getPromptIDForPromptTaskID } from "../../util/promptTaskID";
import getPromptStates from "../getPromptStates";
import {
  MetabookAction,
  MetabookCardStateQuery,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "../userClient";

export class MetabookFirebaseUserClient implements MetabookUserClient {
  userID: string;
  private database: firebase.firestore.Firestore;

  constructor(app: firebase.app.App = getDefaultFirebaseApp(), userID: string) {
    this.userID = userID;
    this.database = app.firestore();
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
      "timestamp",
      "desc",
    );

    const promptStateCache: Map<EncodedPromptID, PromptState> = new Map();
    const latestTimestampByPromptID: Map<
      EncodedPromptID,
      firebase.firestore.Timestamp
    > = new Map();
    return userStateLogsRef.onSnapshot(
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type === "added") {
            const log = change.doc.data();
            const encodedPromptID = encodePromptID(
              getPromptIDForPromptTaskID(log.promptTaskID),
            );
            const latestPromptTimestamp = latestTimestampByPromptID.get(
              encodedPromptID,
            );
            const existingPromptState = promptStateCache.get(encodedPromptID);
            if (
              !existingPromptState ||
              (existingPromptState &&
                latestPromptTimestamp &&
                log.timestamp > latestPromptTimestamp)
            ) {
              promptStateCache.set(encodedPromptID, {
                interval: log.nextIntervalMillis,
                dueTimestampMillis: log.nextDueTimestamp.toMillis(),
                bestInterval: log.nextBestIntervalMillis,
                needsRetry: log.nextNeedsRetry,
              });
            }
            latestTimestampByPromptID.set(
              encodedPromptID,
              latestPromptTimestamp && latestPromptTimestamp > log.timestamp
                ? latestPromptTimestamp
                : log.timestamp,
            );
          } else {
            // TODO probably this isn't robust against client failures to persist / sync
            throw new Error(
              `Log entries should never disappear. Unsupported change type ${
                change.type
              } with doc ${change.doc.data()}`,
            );
          }
        }
        onCardStatesDidUpdate(new Map(promptStateCache));
      },
      (error: Error) => {
        onError(error);
      },
    );
  }

  recordActionLogs(logs: MetabookActionLog[]): Promise<unknown> {
    console.log("recording", logs);
    const userStateLogsRef = this.getActionLogReference(this.userID);
    const batch = this.database.batch();
    for (const log of logs) {
      const newDoc = userStateLogsRef.doc();
      batch.set(newDoc, log);
    }
    return batch.commit();
  }

  recordAction(
    update: MetabookAction,
  ): { newPromptState: PromptState; commit: Promise<unknown> } {
    const actionLog = getActionLogForAction(update);
    const commit = this.recordActionLogs([actionLog]);

    return {
      newPromptState: getNextPromptStateForActionLog(actionLog),
      commit: commit,
    };
  }

  private getActionLogReference(
    userID: string,
  ): firebase.firestore.CollectionReference<MetabookActionLog> {
    // TODO validate
    return this.database.collection(
      `users/${userID}/logs`,
    ) as firebase.firestore.CollectionReference<MetabookActionLog>;
  }
}
