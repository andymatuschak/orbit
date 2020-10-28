import * as firebase from "firebase-admin";
import { reviewSession } from "metabook-core";
import {
  ActionLogDocument,
  getActionLogIDForFirebaseKey,
  getLogCollectionReference,
  getTaskStateCacheCollectionReference,
  getTaskStateCacheReference,
  PromptStateCache,
} from "metabook-firebase-support";
import applyPromptActionLogToPromptStateCache from "../applyPromptActionLogToPromptStateCache";
import { getDatabase } from "./firebase";

export async function updatePromptStateCacheWithLog(
  actionLogDocument: ActionLogDocument<firebase.firestore.Timestamp>,
  userID: string,
): Promise<{
  oldPromptStateCache: PromptStateCache | null;
  newPromptStateCache: PromptStateCache;
}> {
  const db = getDatabase();
  const promptStateCacheReference = await getTaskStateCacheReference(
    db,
    userID,
    actionLogDocument.taskID,
  );
  return db.runTransaction(async (transaction) => {
    const promptStateCacheSnapshot = await transaction.get(
      promptStateCacheReference,
    );

    const oldPromptStateCache =
      (promptStateCacheSnapshot.data() as PromptStateCache) ?? null;

    const newPromptStateCache = await applyPromptActionLogToPromptStateCache({
      actionLogDocument,
      basePromptStateCache: oldPromptStateCache,
      fetchAllActionLogDocumentsForTask: async () => {
        const logQuery = await getLogCollectionReference(db, userID).where(
          "taskID",
          "==",
          actionLogDocument.taskID,
        );
        const logSnapshot = await transaction.get(logQuery);
        return logSnapshot.docs.map((doc) => {
          const actionLogDocument = doc.data() as ActionLogDocument<
            firebase.firestore.Timestamp
          >;
          return {
            id: getActionLogIDForFirebaseKey(doc.id),
            log: actionLogDocument,
          };
        });
      },
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
    } else {
      transaction.set(promptStateCacheReference, newPromptStateCache);
      return { oldPromptStateCache, newPromptStateCache };
    }
  });
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
