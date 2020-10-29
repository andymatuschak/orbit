import * as admin from "firebase-admin";
import { ActionLogID, reviewSession } from "metabook-core";
import {
  ActionLogDocument,
  getActionLogIDForFirebaseKey,
  getLogCollectionReference,
  getTaskStateCacheCollectionReference,
  getTaskStateCacheReference,
  getUserMetadataReference,
  PromptStateCache,
} from "metabook-firebase-support";
import applyPromptActionLogToPromptStateCache from "../applyPromptActionLogToPromptStateCache";
import { getDatabase } from "./firebase";

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
  database: admin.firestore.Firestore,
  transaction: admin.firestore.Transaction,
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

    const newPromptStateCache = await applyPromptActionLogToPromptStateCache({
      actionLogDocument,
      basePromptStateCache: oldPromptStateCache,
      fetchAllActionLogDocumentsForTask: () =>
        fetchAllActionLogDocumentsForTask(
          db,
          transaction,
          userID,
          actionLogDocument.taskID,
        ),
    });

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
  await getUserMetadataReference(db, userID).update({
    activeTaskCount: admin.firestore.FieldValue.increment(
      _getActiveTaskCountDelta(
        result.oldPromptStateCache,
        result.newPromptStateCache,
      ),
    ),
  });

  return result;
}

export async function getDuePromptStates(
  userID: string,
  dueBeforeTimestampMillis: number,
): Promise<PromptStateCache[]> {
  const ref = getTaskStateCacheCollectionReference(getDatabase(), userID)
    .where("dueTimestampMillis", "<=", dueBeforeTimestampMillis)
    .where("taskMetadata.isDeleted", "==", false)
    .limit(reviewSession.getReviewSessionCardLimit());
  const snapshot = await ref.get();
  return snapshot.docs.map((doc) => doc.data());
}
