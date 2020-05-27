import firebase from "firebase/app";
import "firebase/firestore";

import { ActionLog, ActionLogID, getIDForActionLog } from "metabook-core";
import {
  ActionLogDocument,
  batchWriteEntries,
  getActionLogIDForFirebaseKey,
  getLogCollectionReference,
  getReferenceForActionLogID,
  getTaskStateCacheCollectionReference,
  PromptStateCache,
  ServerTimestamp,
} from "metabook-firebase-support";
import { getDefaultFirebaseApp } from "../../firebase";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import { MetabookUserClient, PromptStateQuery } from "../userClient";

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

  async getPromptStates(query?: PromptStateQuery): Promise<PromptStateCache[]> {
    const output: PromptStateCache[] = [];
    let ref = getTaskStateCacheCollectionReference(this.database, this.userID)
      .limit(1000)
      .orderBy("dueTimestampMillis", "asc") as firebase.firestore.Query<
      PromptStateCache
    >;

    if (query) {
      if ("dueBeforeTimestampMillis" in query) {
        ref = ref.where(
          "dueTimestampMillis",
          "<=",
          query.dueBeforeTimestampMillis,
        );
      } else if ("provenanceType" in query) {
        ref = ref.where(
          "provenance.provenanceType",
          "==",
          query.provenanceType,
        );
      }
    }

    let startAfter: firebase.firestore.DocumentSnapshot<
      PromptStateCache
    > | null = null;
    do {
      const offsetRef: firebase.firestore.Query<PromptStateCache> = startAfter
        ? ref.startAfter(startAfter)
        : ref;

      // We'll try from cache first, but if we don't have anything in the cache, we'll look to the server.
      const snapshot = await offsetRef.get();

      for (const doc of snapshot.docs) {
        output.push(doc.data() as PromptStateCache);
      }

      startAfter = snapshot.empty
        ? null
        : snapshot.docs[snapshot.docs.length - 1];
      console.log(`Fetched ${output.length} prompt states`);
    } while (startAfter !== null);

    return output;
  }

  subscribeToActionLogs(
    afterServerTimestamp: ServerTimestamp | null,
    onNewLogs: (
      newLogs: {
        log: ActionLog;
        id: ActionLogID;
        serverTimestamp: ServerTimestamp;
      }[],
    ) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe {
    return this.getActionLogRef(afterServerTimestamp, 1000).onSnapshot(
      (snapshot) => {
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
                // TODO make more robust against client failures to persist / sync
                throw new Error(
                  `Log entries shouldn't change after their creation. Unsupported change type ${
                    change.type
                  } with doc ${change.doc.data()}`,
                );
            }
          }
        }
        if (newLogs.length > 0) {
          onNewLogs(newLogs);
        }
      },
      onError,
    );
  }

  private getActionLogRef(
    afterServerTimestamp: ServerTimestamp | null,
    limit: number,
  ) {
    let userStateLogsRef = getLogCollectionReference(this.database, this.userID)
      .orderBy("serverTimestamp", "asc")
      .limit(limit) as firebase.firestore.Query<ActionLogDocument<Timestamp>>;
    if (afterServerTimestamp) {
      userStateLogsRef = userStateLogsRef.where(
        "serverTimestamp",
        ">",
        new firebase.firestore.Timestamp(
          afterServerTimestamp.seconds,
          afterServerTimestamp.nanoseconds,
        ),
      );
    }
    return userStateLogsRef;
  }

  async getActionLogs(
    afterServerTimestamp: ServerTimestamp,
    limit: number,
  ): Promise<
    { log: ActionLog; id: ActionLogID; serverTimestamp: ServerTimestamp }[]
  > {
    const snapshot = await this.getActionLogRef(
      afterServerTimestamp,
      limit,
    ).get();
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
    await batchWriteEntries(
      logs.map((log) => {
        const logDocument: ActionLogDocument<firebase.firestore.Timestamp> = {
          ...log,
          serverTimestamp: firebase.firestore.FieldValue.serverTimestamp() as firebase.firestore.Timestamp,
        };
        return [
          getReferenceForActionLogID(
            this.database,
            this.userID,
            getIDForActionLog(log),
          ),
          logDocument,
        ];
      }),
      this.database,
      (ms, ns) => new firebase.firestore.Timestamp(ms, ns),
    );
  }
}
