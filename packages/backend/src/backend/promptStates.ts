import {
  ActionLogID,
  applyActionLogToPromptState,
  getActionLogFromPromptActionLog,
  getIDForActionLog,
  getPromptActionLogFromActionLog,
  mergeActionLogs,
  promptActionLogCanBeAppliedToPromptState,
  PromptState,
  PromptTaskID,
  reviewSession,
} from "@withorbit/core";
import firebase from "firebase-admin";
import {
  ActionLogDocument,
  getActionLogIDForFirebaseKey,
  getLogCollectionReference,
  getPromptStateFromPromptStateCache,
  getTaskStateCacheCollectionReference,
  getTaskStateCacheReference,
  maxServerTimestamp,
  PromptStateCache,
} from "./firebaseSupport";
import { getDatabase } from "./firebaseSupport/firebase";

function taskIsActive(promptStateCache: PromptStateCache | null): boolean {
  return !!promptStateCache && !promptStateCache.taskMetadata.isDeleted;
}

export function _getActiveTaskCountDelta(
  oldPromptStateCache: PromptStateCache | null,
  newPromptStateCache: PromptStateCache,
) {
  const promptWasActive = taskIsActive(oldPromptStateCache);
  const promptIsActive = taskIsActive(newPromptStateCache);
  if (!promptWasActive && promptIsActive) {
    return 1;
  } else if (promptWasActive && !promptIsActive) {
    return -1;
  } else {
    return 0;
  }
}

async function fetchAllActionLogDocumentsForTask(
  database: firebase.firestore.Firestore,
  transaction: firebase.firestore.Transaction,
  userID: string,
  taskID: string,
): Promise<{ id: ActionLogID; log: ActionLogDocument }[]> {
  const logQuery = await getLogCollectionReference(database, userID).where(
    "taskID",
    "==",
    taskID,
  );
  const logSnapshot = await transaction.get(logQuery);
  return logSnapshot.docs.map((doc) => {
    return {
      id: getActionLogIDForFirebaseKey(doc.id),
      log: doc.data(),
    };
  });
}

export async function _applyActionLogDocumentToPromptStateCache({
  actionLogDocument,
  basePromptStateCache,
  fetchAllActionLogDocumentsForTask,
}: {
  actionLogDocument: ActionLogDocument;
  basePromptStateCache: PromptStateCache | null;
  fetchAllActionLogDocumentsForTask: () => Promise<
    { id: ActionLogID; log: ActionLogDocument }[]
  >;
}): Promise<PromptStateCache | Error> {
  const promptActionLog = getPromptActionLogFromActionLog(actionLogDocument);
  const creationServerTimestamp =
    basePromptStateCache?.creationServerTimestamp ??
    actionLogDocument.serverTimestamp;
  if (
    promptActionLogCanBeAppliedToPromptState(
      promptActionLog,
      basePromptStateCache,
    )
  ) {
    const newPromptState = applyActionLogToPromptState({
      basePromptState: basePromptStateCache,
      actionLogID: await getIDForActionLog(
        getActionLogFromPromptActionLog(promptActionLog),
      ),
      promptActionLog,
      schedule: "default",
    });
    if (newPromptState instanceof Error) {
      return newPromptState;
    } else {
      return {
        ...newPromptState,
        latestLogServerTimestamp: maxServerTimestamp(
          actionLogDocument.serverTimestamp,
          basePromptStateCache?.latestLogServerTimestamp ?? null,
        ),
        creationServerTimestamp,
        taskID: promptActionLog.taskID,
      };
    }
  } else {
    console.log("Log does not apply cleanly. Doing full merge.");
    const allActionLogDocuments = await fetchAllActionLogDocumentsForTask();
    const mergedPromptState = mergeActionLogs(
      allActionLogDocuments.map(({ id, log }) => ({
        id,
        log: getPromptActionLogFromActionLog(log),
      })),
    );
    if (mergedPromptState instanceof Error) {
      return mergedPromptState;
    } else {
      const latestLogServerTimestamp = allActionLogDocuments.reduce(
        (max, { log }) => {
          const timestamp = log.serverTimestamp;
          if (max) {
            return maxServerTimestamp(timestamp, max);
          } else {
            return timestamp;
          }
        },
        null as firebase.firestore.Timestamp | null,
      )!;
      return {
        ...mergedPromptState,
        taskID: actionLogDocument.taskID as PromptTaskID,
        latestLogServerTimestamp,
        creationServerTimestamp,
      };
    }
  }
}

export async function updatePromptStateCacheWithLog(
  actionLogDocument: ActionLogDocument,
  userID: string,
): Promise<{
  oldPromptStateCache: PromptStateCache | null;
  newPromptStateCache: PromptStateCache;
}> {
  const db = getDatabase();
  const result = await db.runTransaction(async (transaction) => {
    const promptStateCacheReference = await getTaskStateCacheReference(
      db,
      userID,
      actionLogDocument.taskID,
    );
    const promptStateCacheSnapshot = await transaction.get(
      promptStateCacheReference,
    );

    const oldPromptStateCache =
      (promptStateCacheSnapshot.data() as PromptStateCache) ?? null;

    const newPromptStateCache = await _applyActionLogDocumentToPromptStateCache(
      {
        actionLogDocument,
        basePromptStateCache: oldPromptStateCache,
        fetchAllActionLogDocumentsForTask: () =>
          fetchAllActionLogDocumentsForTask(
            db,
            transaction,
            userID,
            actionLogDocument.taskID,
          ),
      },
    );

    if (newPromptStateCache instanceof Error) {
      throw new Error(
        `Error applying log to prompt state: ${newPromptStateCache}.\nLog: ${JSON.stringify(
          actionLogDocument,
          null,
          "\t",
        )}\nBase prompt state: ${JSON.stringify(
          oldPromptStateCache,
          null,
          "\t",
        )}`,
      );
    }

    transaction.set(promptStateCacheReference, newPromptStateCache);
    return { oldPromptStateCache, newPromptStateCache };
  });

  // n.b. this active task count update operation is outside the transaction because the increment operation is itself transactional; we don't need to make the transaction retry if there's contention on the user metadata document.
  // This is all being updated in core2 now.
  /*await getUserMetadataReference(db, userID).update({
    activeTaskCount: firebase.firestore.FieldValue.increment(
      _getActiveTaskCountDelta(
        result.oldPromptStateCache,
        result.newPromptStateCache,
      ),
    ),
  });*/

  return result;
}

export async function listPromptStates(
  userID: string,
  query: {
    limit: number;
  } & (
    | { dueBeforeTimestampMillis: number }
    | { createdAfterID?: PromptTaskID }
  ),
): Promise<Map<PromptTaskID, PromptState>> {
  const db = getDatabase();
  let ref: firebase.firestore.Query<PromptStateCache> =
    getTaskStateCacheCollectionReference(db, userID);
  if ("dueBeforeTimestampMillis" in query) {
    ref = ref
      .where(
        "dueTimestampMillis",
        "<=",
        reviewSession.getFuzzyDueTimestampThreshold(
          query.dueBeforeTimestampMillis,
        ),
      )
      .where("taskMetadata.isDeleted", "==", false);
  } else {
    ref = ref.orderBy("creationServerTimestamp");
    if (query.createdAfterID) {
      const baseRef = getTaskStateCacheReference(
        db,
        userID,
        query.createdAfterID,
      );
      const baseSnapshot = await baseRef.get();
      if (!baseSnapshot.exists) {
        throw new Error(
          `createdAfterID ${query.createdAfterID} does not exist`,
        );
      }
      ref = ref.startAfter(baseSnapshot);
    }
  }
  ref = ref.limit(query.limit);

  const snapshot = await ref.get();
  return new Map(
    snapshot.docs.map((doc) => {
      const data = doc.data();
      return [data.taskID, getPromptStateFromPromptStateCache(data)];
    }),
  );
}

export async function getPromptStates(
  userID: string,
  taskIDs: PromptTaskID[],
): Promise<Map<PromptTaskID, PromptState>> {
  const db = getDatabase();
  const refs = await Promise.all(
    taskIDs.map((id) => getTaskStateCacheReference(db, userID, id)),
  );
  const snapshots = await getDatabase().getAll(...refs);
  return new Map(
    snapshots
      .map((snapshot) =>
        snapshot.exists ? (snapshot.data() as PromptStateCache) : null,
      )
      .filter((p): p is PromptStateCache => !!p)
      .map((p) => [p.taskID, getPromptStateFromPromptStateCache(p)]),
  );
}
