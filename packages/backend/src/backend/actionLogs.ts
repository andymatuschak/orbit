import * as firebase from "firebase-admin";
import { ActionLog, ActionLogID, PromptState } from "@withorbit/core";
import {
  getActionLogFromActionLogDocument,
  getActionLogIDForFirebaseKey,
  getActionLogIDReference,
  getLogCollectionReference,
  getPromptStateFromPromptStateCache,
  serverTimestampToTimestampMillis,
  storeLogs as _storeLogs,
} from "@withorbit/firebase-support";
import { getDatabase } from "./firebase";
import { updatePromptStateCacheWithLog } from "./promptStates";

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
  // These logs will all end up with the same server timestamp, which create a lot of flailing in onLogCreate, since execution order is not guaranteed. We'll go ahead and compute the new prompt states right here.
  const storedLogs = await _storeLogs(
    logs,
    userID,
    getDatabase(),
    () => firebase.firestore.Timestamp.now(),
    true,
  );

  // Apply each log sequentially, with a separate transaction for each. This is a bit wasteful.
  const results: StoreActionLogResults = [];
  for (const [, log] of storedLogs) {
    const { newPromptStateCache } = await updatePromptStateCacheWithLog(
      log,
      userID,
    );
    results.push({
      log: getActionLogFromActionLogDocument(log),
      serverTimestampMillis: serverTimestampToTimestampMillis(
        log.serverTimestamp,
      ),
      promptState: getPromptStateFromPromptStateCache(newPromptStateCache),
    });
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
