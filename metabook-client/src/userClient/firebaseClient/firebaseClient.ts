import firebase from "firebase/app";
import "firebase/firestore";

import {
  encodePrompt,
  getInitialIntervalForSchedule,
  PromptID,
  PromptState,
} from "metabook-core";
import { getDefaultFirebaseApp } from "../../firebase";
import {
  MetabookActionLog,
  MetabookIngestActionLog,
  MetabookReviewActionLog,
} from "../../types/actionLog";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import { getActionLogForAction } from "../../util/getActionLogForAction";
import { getNextPromptStateForReviewLog } from "../../util/getNextPromptStateForActionLog";
import getPromptStates from "../getPromptStates";
import {
  MetabookReviewAction,
  MetabookCardStateQuery,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "../userClient";

function getPromptIDForActionLog(log: MetabookActionLog) {
  switch (log.actionLogType) {
    case "ingest":
      return encodePrompt(log.prompt);
    case "review":
      return encodePrompt(log.promptTask.prompt);
  }
}

export class MetabookFirebaseUserClient implements MetabookUserClient {
  userID: string;
  private database: firebase.firestore.Firestore;
  private promptStateCache: Map<PromptID, PromptState>;
  private latestTimestampByPromptID: Map<
    PromptID,
    firebase.firestore.Timestamp
  >;

  constructor(app: firebase.app.App = getDefaultFirebaseApp(), userID: string) {
    this.userID = userID;
    this.database = app.firestore();
    this.promptStateCache = new Map();
    this.latestTimestampByPromptID = new Map();
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

  private updateCacheForLog(log: MetabookActionLog): void {
    const promptID = getPromptIDForActionLog(log);
    const latestPromptTimestamp = this.latestTimestampByPromptID.get(promptID);
    if (
      !latestPromptTimestamp ||
      (latestPromptTimestamp && log.timestamp > latestPromptTimestamp)
    ) {
      switch (log.actionLogType) {
        case "ingest":
          this.updateCacheForIngestLog(log, promptID);
          break;
        case "review":
          this.updateCacheForReviewLog(log, promptID);
          break;
      }

      this.latestTimestampByPromptID.set(promptID, log.timestamp);
    }
  }

  private updateCacheForReviewLog(
    log: MetabookReviewActionLog,
    promptID: PromptID,
  ) {
    this.promptStateCache.set(promptID, {
      interval: log.nextIntervalMillis,
      dueTimestampMillis: log.nextDueTimestamp.toMillis(),
      bestInterval: log.nextBestIntervalMillis,
      needsRetry: log.nextNeedsRetry,
      taskParameters: log.promptTask.parameters,
    });
  }

  private updateCacheForIngestLog(
    log: MetabookIngestActionLog,
    promptID: PromptID,
  ) {
    const initialInterval = getInitialIntervalForSchedule("default").interval;
    this.promptStateCache.set(promptID, {
      interval: initialInterval,
      dueTimestampMillis: log.timestamp.toMillis() + initialInterval,
      bestInterval: null,
      needsRetry: false,
      taskParameters: null,
    });
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
    update: MetabookReviewAction,
  ): { newPromptState: PromptState; commit: Promise<unknown> } {
    const actionLog = getActionLogForAction(update);
    const commit = this.recordActionLogs([actionLog]);

    return {
      newPromptState: getNextPromptStateForReviewLog(
        actionLog,
        update.promptSpec,
      ),
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
