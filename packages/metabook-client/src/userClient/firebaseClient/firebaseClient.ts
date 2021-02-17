import firebase from "firebase/app";
import "firebase/firestore";

import { ActionLog, ActionLogID } from "metabook-core";
import {
  ActionLogDocument,
  getActionLogIDForFirebaseKey,
  getLogCollectionReference,
  getTaskStateCacheCollectionReference,
  PromptStateCache,
  ServerTimestamp,
  storeLogs,
} from "metabook-firebase-support";
import { getDefaultFirebaseApp } from "../../firebase";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import {
  ActionLogQuery,
  MetabookUserClient,
  PromptStateQuery,
} from "../userClient";

type Timestamp = firebase.firestore.Timestamp;

export class MetabookFirebaseUserClient implements MetabookUserClient {
  userID: string;
  private database: firebase.firestore.Firestore;

  constructor(
    firestore: firebase.firestore.Firestore = getDefaultFirebaseApp().firestore(),
    userID: string,
  ) {
    this.userID = userID;
    this.database = firestore;
  }

  async getPromptStates(query: PromptStateQuery): Promise<PromptStateCache[]> {
    let ref = getTaskStateCacheCollectionReference(
      this.database,
      this.userID,
    ).limit(query.limit || 1000) as firebase.firestore.Query<PromptStateCache>;

    if (query) {
      if ("dueBeforeTimestampMillis" in query) {
        ref = ref
          .orderBy("dueTimestampMillis", "asc")
          .where("dueTimestampMillis", "<=", query.dueBeforeTimestampMillis);
      } else {
        ref = ref.orderBy("latestLogServerTimestamp", "asc");
        if (query.updatedAfterServerTimestamp !== undefined) {
          ref = ref.where(
            "latestLogServerTimestamp",
            ">",
            new firebase.firestore.Timestamp(
              query.updatedAfterServerTimestamp.seconds,
              query.updatedAfterServerTimestamp.nanoseconds,
            ),
          );
        }
        if (query.updatedOnOrBeforeServerTimestamp !== undefined) {
          ref = ref.where(
            "latestLogServerTimestamp",
            "<=",
            new firebase.firestore.Timestamp(
              query.updatedOnOrBeforeServerTimestamp.seconds,
              query.updatedOnOrBeforeServerTimestamp.nanoseconds,
            ),
          );
        }
        if (query.provenanceType) {
          ref = ref.where(
            "taskMetadata.provenance.provenanceType",
            "==",
            query.provenanceType,
          );
        }
      }
    }

    const snapshot = await ref.get();
    return snapshot.docs.map((doc) => doc.data() as PromptStateCache);
  }

  subscribeToActionLogs(
    query: ActionLogQuery,
    onNewLogs: (
      newLogs: {
        log: ActionLog;
        id: ActionLogID;
        serverTimestamp: ServerTimestamp;
      }[],
    ) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe {
    return this.getActionLogRef(query).onSnapshot((snapshot) => {
      const newLogs: {
        log: ActionLog;
        id: ActionLogID;
        serverTimestamp: ServerTimestamp;
      }[] = [];
      for (const change of snapshot.docChanges()) {
        if (!change.doc.metadata.hasPendingWrites) {
          switch (change.type) {
            case "added":
            case "modified":
              const {
                serverTimestamp,
                suppressTaskStateCacheUpdate,
                ...log
              } = change.doc.data({ serverTimestamps: "none" });
              newLogs.push({
                log,
                id: getActionLogIDForFirebaseKey(change.doc.id),
                serverTimestamp,
              });
              break;
            case "removed":
              throw new Error(
                `Log entries shouldn't ever be removed after their creation. Unsupported change type ${
                  change.type
                } with doc ${change.doc.data()}`,
              );
          }
        }
      }
      if (newLogs.length > 0) {
        onNewLogs(newLogs);
      }
    }, onError);
  }

  private getActionLogRef(query: ActionLogQuery) {
    let userStateLogsRef = getLogCollectionReference(this.database, this.userID)
      .orderBy("serverTimestamp", "asc")
      .limit(query.limit || 1000) as firebase.firestore.Query<
      ActionLogDocument<Timestamp>
    >;
    if (query.afterServerTimestamp) {
      userStateLogsRef = userStateLogsRef.where(
        "serverTimestamp",
        ">",
        new firebase.firestore.Timestamp(
          query.afterServerTimestamp.seconds,
          query.afterServerTimestamp.nanoseconds,
        ),
      );
    }
    if (query.onOrBeforeServerTimestamp) {
      userStateLogsRef = userStateLogsRef.where(
        "serverTimestamp",
        "<=",
        new firebase.firestore.Timestamp(
          query.onOrBeforeServerTimestamp.seconds,
          query.onOrBeforeServerTimestamp.nanoseconds,
        ),
      );
    }

    return userStateLogsRef;
  }

  async getActionLogs(
    query: ActionLogQuery,
  ): Promise<
    { log: ActionLog; id: ActionLogID; serverTimestamp: ServerTimestamp }[]
  > {
    const snapshot = await this.getActionLogRef(query).get();
    return snapshot.docs.map((doc) => {
      const {
        serverTimestamp,
        suppressTaskStateCacheUpdate,
        ...log
      } = doc.data();
      return { log, id: getActionLogIDForFirebaseKey(doc.id), serverTimestamp };
    });
  }

  async recordActionLogs(logs: ActionLog[]): Promise<void> {
    await storeLogs(logs, this.userID, this.database, () =>
      firebase.firestore.FieldValue.serverTimestamp(),
    );
  }
}
