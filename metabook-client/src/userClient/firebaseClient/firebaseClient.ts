import firebase from "firebase/app";
import "firebase/firestore";

import {
  ActionLog,
  applyActionLogToPromptState,
  getIDForActionLog,
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

async function batchWriteEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logEntries: [string, any][],
  db: firebase.firestore.Firestore,
  logRef: firebase.firestore.CollectionReference,
) {
  for (
    let batchBaseIndex = 0;
    batchBaseIndex <= logEntries.length;
    batchBaseIndex += 500
  ) {
    const batch = db.batch();
    for (
      let index = batchBaseIndex;
      index < batchBaseIndex + 500 && index < logEntries.length;
      index++
    ) {
      const data = { ...logEntries[index][1] };
      for (const key of Object.keys(data)) {
        if (
          typeof data[key] === "object" &&
          data[key] &&
          "_nanoseconds" in data[key] &&
          "_seconds" in data[key]
        ) {
          data[key] = new firebase.firestore.Timestamp(
            data[key]["_seconds"],
            data[key]["_nanoseconds"],
          );
        }
      }
      batch.set(logRef.doc(logEntries[index][0]), data);
    }
    await batch.commit();
  }
}

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
      "asc",
    );
    // .limit(500);

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
      if (
        promptActionLog.taskID ===
        "zdj7WmY91tqZAuhjLNsjCSjt1SQe5RDYKoNrktXtdjHAnJsKQ/cloze/0"
      ) {
        console.log(JSON.stringify(log, null, "\t"));
        console.log("wire", getIDForActionLog(log));
        console.log(
          "local",
          getIDForActionLog({
            actionLogType: "ingest",
            taskID: "zdj7WmY91tqZAuhjLNsjCSjt1SQe5RDYKoNrktXtdjHAnJsKQ/cloze/0",
            timestampMillis: 1451593523946,
            metadata: {
              provenanceType: "anki",
              cardModificationTimestampMillis: 1579019518000,
              cardID: 1451593523946,
            },
          }),
        );
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
    const userStateLogsRef = this.getActionLogReference(this.userID);
    await batchWriteEntries(
      logs.map((log) => [getIDForActionLog(log), log]),
      this.database,
      userStateLogsRef,
    );
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
