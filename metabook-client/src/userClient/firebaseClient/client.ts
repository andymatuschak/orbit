import firebase from "firebase/app";
import "firebase/firestore";

import { CardState } from "metabook-core";
import { getDefaultFirebaseApp } from "../../firebase";
import { MetabookActionLog } from "../../types/actionLog";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import {
  MetabookCardStateSnapshot,
  MetabookAction,
  MetabookCardStateQuery,
  MetabookUserClient,
} from "../userClient";
import { getActionLogForAction } from "../../util/getActionLogForAction";
import getCardStates from "../getCardStates";
import { getNextCardStateForActionLog } from "../../util/getNextCardStateForActionLog";

export class MetabookFirebaseUserClient implements MetabookUserClient {
  userID: string;
  private database: firebase.firestore.Firestore;

  constructor(app: firebase.app.App = getDefaultFirebaseApp(), userID: string) {
    this.userID = userID;
    this.database = app.firestore();
  }

  async getCardStates(
    query: MetabookCardStateQuery,
  ): Promise<MetabookCardStateSnapshot> {
    return getCardStates(this, query);
  }

  subscribeToCardStates(
    query: MetabookCardStateQuery,
    onCardStatesDidUpdate: (newCardStates: MetabookCardStateSnapshot) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe {
    // TODO: handle in-memory card state records...
    const userStateLogsRef = this.getActionLogReference(this.userID).orderBy(
      "timestamp",
      "desc",
    );

    const cardStateCache: MetabookCardStateSnapshot = {};
    const latestTimestampByCardID: {
      [key: string]: firebase.firestore.Timestamp;
    } = {};
    return userStateLogsRef.onSnapshot(
      snapshot => {
        for (const change of snapshot.docChanges()) {
          if (change.type === "added") {
            const log = change.doc.data();
            const { promptID } = log;
            if (
              !cardStateCache[promptID] ||
              (cardStateCache[promptID] &&
                log.timestamp > latestTimestampByCardID[promptID])
            ) {
              cardStateCache[promptID] = {
                interval: log.nextIntervalMillis,
                dueTime: log.nextDueTimestamp.toMillis(),
                bestInterval: log.nextBestIntervalMillis,
                needsRetry: log.nextNeedsRetry,
                orderSeed: log.nextOrderSeed,
              };
            }
          } else {
            // TODO probably this isn't robust against client failures to persist / sync
            throw new Error("Log entries should never disappear");
          }
        }
        onCardStatesDidUpdate(cardStateCache);
      },
      (error: Error) => {
        onError(error);
      },
    );
  }

  recordActionLogs(logs: MetabookActionLog[]): Promise<unknown> {
    const userStateLogsRef = this.getActionLogReference(this.userID);
    const batch = this.database.batch();
    for (const log of logs) {
      const newDoc = userStateLogsRef.doc();
      batch.set(newDoc, log);
    }
    return batch.commit();
  }

  recordCardStateUpdate(
    update: MetabookAction,
  ): { newCardState: CardState; commit: Promise<unknown> } {
    const orderSeed = Math.random();
    const actionLog = getActionLogForAction(update, orderSeed);
    const commit = this.recordActionLogs([actionLog]);

    return {
      newCardState: getNextCardStateForActionLog(actionLog),
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
