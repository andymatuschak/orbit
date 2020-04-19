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
} from "metabook-firebase-shared";
import { getDefaultFirebaseApp } from "../../firebase";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import getPromptStates from "../getPromptStates";
import {
  MetabookCardStateQuery,
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
  private readonly promptStateCache: Map<PromptTaskID, PromptState>;

  private promptStateCacheStatus: "unstarted" | "fetching" | "primed";
  private latestRecordedServerLogTimestamp: Timestamp | null;

  private subscribers: Set<Subscriber>;
  private logSubscription: (() => void) | null;

  constructor(
    firestore: firebase.firestore.Firestore = getDefaultFirebaseApp().firestore(),
    userID: string,
  ) {
    this.userID = userID;
    this.database = firestore;
    this.promptStateCache = new Map();
    this.promptStateCacheStatus = "unstarted";
    this.latestRecordedServerLogTimestamp = null;
    this.subscribers = new Set();
    this.logSubscription = null;
  }

  async getPromptStates(
    query: MetabookCardStateQuery,
  ): Promise<MetabookPromptStateSnapshot> {
    return getPromptStates(this, query);
  }

  private async fetchInitialCachedPromptStates(): Promise<void> {
    if (this.promptStateCacheStatus !== "unstarted") {
      return;
    }

    // TODO: rationalize unwritten logs with incoming prompt states

    this.promptStateCacheStatus = "fetching";
    console.log("Fetching initial prompt state cache");

    try {
      const ref = getTaskStateCacheCollectionReference(
        this.database,
        this.userID,
      ).limit(1000) as firebase.firestore.Query<PromptStateCache<Timestamp>>;
      let startAfter: firebase.firestore.DocumentSnapshot<
        PromptStateCache<Timestamp>
      > | null = null;
      let usingCache = true;
      do {
        const offsetRef: firebase.firestore.Query<PromptStateCache<
          Timestamp
        >> = startAfter ? ref.startAfter(startAfter) : ref;

        // We'll try from cache first, but if we don't have anything in the cache, we'll look to the server.
        let snapshot = await offsetRef.get(
          usingCache ? { source: "cache" } : {},
        );
        if (snapshot.docs.length === 0 && this.promptStateCache.size === 0) {
          console.log(
            "No cached prompt states; falling back to remote prompt states.",
          );
          usingCache = false;
          snapshot = await offsetRef.get();
        }

        for (const doc of snapshot.docs) {
          const { taskID, lastLogServerTimestamp, ...promptState } = doc.data();
          this.promptStateCache.set(taskID as PromptTaskID, promptState);
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
          `Fetched ${this.promptStateCache.size} caches ${
            snapshot.metadata.fromCache ? "from cache" : ""
          }`,
        );
      } while (startAfter !== null);
    } catch (error) {
      this.dispatchErrorToAllSubscribers(error);
      // TODO: Leaves the system in an inconsistent state. What should we actually do at this point?
    }

    console.log("Done fetching prompt state caches.");
    console.log(
      "Latest server timestamp now",
      this.latestRecordedServerLogTimestamp,
    );
    this.promptStateCacheStatus = "primed";

    this.subscribeToLogs();
  }

  private dispatchSubscriber(subscriber: Subscriber) {
    subscriber[1](new Map(this.promptStateCache));
  }

  private dispatchAllSubscribers() {
    this.subscribers.forEach((subscriber) =>
      this.dispatchSubscriber(subscriber),
    );
  }

  private dispatchErrorToAllSubscribers(error: Error) {
    this.subscribers.forEach((s) => s[2](error));
  }

  private subscribeToLogs() {
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

    console.log("Subscribing to logs");
    this.logSubscription = userStateLogsRef.onSnapshot(
      (snapshot) => {
        console.log("Got log snapshot of size", snapshot.size);
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
              this.updateCacheForLog(log);
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
        this.dispatchAllSubscribers();
      },
      (error: Error) => {
        for (const subscriber of this.subscribers) {
          subscriber[2](error);
        }
      },
    );
  }

  subscribeToPromptStates(
    query: MetabookCardStateQuery,
    onCardStatesDidUpdate: (newCardStates: MetabookPromptStateSnapshot) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe {
    const subscriber: Subscriber = [query, onCardStatesDidUpdate, onError];
    this.subscribers.add(subscriber);
    if (this.promptStateCacheStatus === "unstarted") {
      this.fetchInitialCachedPromptStates();
    } else if (this.promptStateCacheStatus === "primed") {
      if (this.logSubscription === null) {
        this.subscribeToLogs();
      } else {
        this.dispatchSubscriber(subscriber);
      }
    }

    return () => {
      this.subscribers.delete(subscriber);
      if (this.subscribers.size === 0) {
        this.logSubscription?.();
        this.logSubscription = null;
      }
    };
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
