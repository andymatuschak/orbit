import {
  ActionLog,
  ActionLogID,
  getIDForActionLogSync,
  PromptState,
} from "@withorbit/core";
import * as firebase from "firebase-admin";
import { getDatabase } from "./firebase";
import {
  ActionLogDocument,
  getActionLogFromActionLogDocument,
  getActionLogIDForFirebaseKey,
  getActionLogIDReference,
  getLogCollectionReference,
  getPromptStateFromPromptStateCache,
  serverTimestampToTimestampMillis,
} from "./firebaseSupport";
import batchWriteEntries from "./firebaseSupport/batchWriteEntries";
import { updatePromptStateCacheWithLog } from "./promptStates";
import { clearUserSessionNotificationState } from "./users";

type StoreActionLogResults = {
  log: ActionLog;
  serverTimestampMillis: number;
  promptState: PromptState;
}[];

// Returns an array of the stored log documents and their corresponding prompt states.
export async function storeActionLogs(
  userID: string,
  logs: ActionLog[],
): Promise<StoreActionLogResults> {
  const database = getDatabase();
  const newDocuments = logs.map((log) => {
    const logDocument: ActionLogDocument = {
      ...log,
      serverTimestamp: firebase.firestore.Timestamp.now(),
      // These logs will all end up with the same server timestamp, which create a lot of flailing in onLogCreate, since execution order is not guaranteed. We'll go ahead and compute the new prompt states right here.
      suppressTaskStateCacheUpdate: true,
    };

    const ref = getActionLogIDReference(
      database,
      userID,
      getIDForActionLogSync(log),
    ) as firebase.firestore.DocumentReference<ActionLogDocument>;

    return [ref, logDocument] as [
      firebase.firestore.DocumentReference<ActionLogDocument>,
      ActionLogDocument,
    ];
  });
  await batchWriteEntries(newDocuments, database);

  // Update the prompt state for each log sequentially, using a separate transaction for each. This is a bit wasteful.
  const results: StoreActionLogResults = [];
  let hasReviewedOldPrompt = false;

  for (const [, log] of newDocuments) {
    const { oldPromptStateCache, newPromptStateCache } =
      await updatePromptStateCacheWithLog(log, userID);
    if (oldPromptStateCache) {
      hasReviewedOldPrompt = true;
    }

    results.push({
      log: getActionLogFromActionLogDocument(log),
      serverTimestampMillis: serverTimestampToTimestampMillis(
        log.serverTimestamp,
      ),
      promptState: getPromptStateFromPromptStateCache(newPromptStateCache),
    });
  }

  if (hasReviewedOldPrompt) {
    // We reset the user's review session notification state when they review a prompt, unless they're just collecting it for the first time.
    await clearUserSessionNotificationState(userID);
  }

  return results;
}

export async function listActionLogs(
  userID: string,
  query: {
    limit: number;
    createdAfterID?: ActionLogID;
  },
): Promise<Map<ActionLogID, ActionLog>> {
  const db = getDatabase();
  const ref = getLogCollectionReference(db, userID).orderBy("serverTimestamp");
  if (query.createdAfterID) {
    const baseRef = await getActionLogIDReference(
      db,
      userID,
      query.createdAfterID,
    );
    const baseSnapshot = await baseRef.get();
    if (!baseSnapshot.exists) {
      throw new Error(`afterID ${query.createdAfterID} does not exist`);
    }
    ref.startAfter(baseSnapshot);
  }
  ref.limit(query.limit);

  const snapshot = await ref.get();
  return new Map(
    snapshot.docs.map((doc) => [
      getActionLogIDForFirebaseKey(doc.id),
      getActionLogFromActionLogDocument(doc.data()),
    ]),
  );
}
