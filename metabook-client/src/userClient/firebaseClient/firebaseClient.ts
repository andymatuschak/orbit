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
  ActionLogDocument,
  batchWriteEntries,
  getLogCollectionReference,
  getReferenceForActionLogID,
  getTaskStateCacheCollectionReference,
  PromptStateCache,
} from "metabook-firebase-support";
import { getDefaultFirebaseApp } from "../../firebase";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import getPromptStates from "../getPromptStates";
import {
  PromptStateQuery,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "../userClient";

type Timestamp = firebase.firestore.Timestamp;

type Subscriber = Parameters<
  MetabookFirebaseUserClient["subscribeToPromptStates"]
>;

export class MetabookFirebaseUserClient implements MetabookUserClient {
  userID: string;
  private database: firebase.firestore.Firestore;
  private latestRecordedServerLogTimestamp: Timestamp | null;

  constructor(
    firestore: firebase.firestore.Firestore = getDefaultFirebaseApp().firestore(),
    userID: string,
  ) {
    this.userID = userID;
    this.database = firestore;
    this.latestRecordedServerLogTimestamp = null;
  }

  async getPromptStates(
    query: PromptStateQuery,
  ): Promise<MetabookPromptStateSnapshot> {
    return getPromptStates(this, query);
  }

  private async fetchInitialCachedPromptStates(
    query: PromptStateQuery,
  ): Promise<Map<PromptTaskID, PromptState>> {
    // TODO: rationalize unwritten logs with incoming prompt states

    const promptStateCache: Map<PromptTaskID, PromptState> = new Map();
    console.log("Fetching prompt states with query", query);

    let ref = getTaskStateCacheCollectionReference(
      this.database,
      this.userID,
    ).limit(1000) as firebase.firestore.Query<PromptStateCache<Timestamp>>;

    if (query.dueBeforeTimestampMillis) {
      ref = ref.where(
        "dueTimestampMillis",
        "<",
        query.dueBeforeTimestampMillis,
      );
    }

    let startAfter: firebase.firestore.DocumentSnapshot<
      PromptStateCache<Timestamp>
    > | null = null;
    let usingCache = true;
    do {
      const offsetRef: firebase.firestore.Query<PromptStateCache<
        Timestamp
      >> = startAfter ? ref.startAfter(startAfter) : ref;

      // We'll try from cache first, but if we don't have anything in the cache, we'll look to the server.
      let snapshot = await offsetRef.get(usingCache ? { source: "cache" } : {});
      if (snapshot.docs.length === 0 && promptStateCache.size === 0) {
        console.log(
          "No cached prompt states; falling back to remote prompt states.",
        );
        usingCache = false;
        snapshot = await offsetRef.get();
      }

      for (const doc of snapshot.docs) {
        const { taskID, lastLogServerTimestamp, ...promptState } = doc.data();
        promptStateCache.set(taskID as PromptTaskID, promptState);
        this.latestRecordedServerLogTimestamp =
          this.latestRecordedServerLogTimestamp === null ||
          lastLogServerTimestamp > this.latestRecordedServerLogTimestamp
            ? lastLogServerTimestamp
            : this.latestRecordedServerLogTimestamp;
      }

      startAfter = snapshot.empty
        ? null
        : snapshot.docs[snapshot.docs.length - 1];
      console.log(
        `Fetched ${promptStateCache.size} caches ${
          snapshot.metadata.fromCache ? "from cache" : ""
        }`,
      );
    } while (startAfter !== null);

    console.log("Done fetching prompt state caches.");
    console.log(
      "Latest server timestamp now",
      this.latestRecordedServerLogTimestamp,
    );

    return promptStateCache;
  }

  subscribeToPromptStates(
    query: PromptStateQuery,
    onPromptStatesDidUpdate: (
      newCardStates: MetabookPromptStateSnapshot,
    ) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe {
    let didUnsubscribe = false;
    let unsubscribeListener: MetabookUnsubscribe | null = null;

    this.fetchInitialCachedPromptStates(query)
      .then((promptStateCache) => {
        if (didUnsubscribe) {
          return;
        }

        let userStateLogsRef = getLogCollectionReference(
          this.database,
          this.userID,
        ).orderBy("serverTimestamp", "asc") as firebase.firestore.Query<
          ActionLogDocument<Timestamp>
        >;
        if (this.latestRecordedServerLogTimestamp) {
          userStateLogsRef = userStateLogsRef.where(
            "serverTimestamp",
            ">",
            this.latestRecordedServerLogTimestamp,
          );
        }

        console.log("Subscribing to logs", Date.now());
        unsubscribeListener = userStateLogsRef.onSnapshot((snapshot) => {
          console.log("Got log snapshot of size", snapshot.size, Date.now());
          for (const change of snapshot.docChanges()) {
            const log = change.doc.data({ serverTimestamps: "none" });
            if (
              log.serverTimestamp &&
              (!this.latestRecordedServerLogTimestamp ||
                log.serverTimestamp > this.latestRecordedServerLogTimestamp)
            ) {
              this.latestRecordedServerLogTimestamp = log.serverTimestamp;
              console.log(`Latest server timestamp now`, log.serverTimestamp);
            }
            switch (change.type) {
              case "added":
                this.updateCacheForLog(promptStateCache, log);
                break;
              case "modified":
                console.log("Ignoring modification to log", change.doc.id, log);
                break;
              case "removed":
                // TODO make more robust against client failures to persist / sync
                throw new Error(
                  `Log entries should never disappear. Unsupported change type ${
                    change.type
                  } with doc ${change.doc.data()}`,
                );
            }
          }
          onPromptStatesDidUpdate(new Map(promptStateCache));
        }, onError);
      })
      .catch((error) => {
        onError(error);
      });

    return () => {
      didUnsubscribe = true;
      unsubscribeListener?.();
    };
  }

  private updateCacheForLog(
    promptStateCache: Map<PromptTaskID, PromptState>,
    log: ActionLog,
  ): void {
    const promptActionLog = getPromptActionLogFromActionLog(log);
    const cachedPromptState =
      promptStateCache.get(promptActionLog.taskID) ?? null;
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
      promptStateCache.set(promptActionLog.taskID, newPromptState);
    } else {
      console.warn(
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
