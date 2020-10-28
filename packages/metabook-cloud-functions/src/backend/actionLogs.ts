import * as firebase from "firebase-admin";
import { ActionLog } from "metabook-core";
import { storeLogs as _storeLogs } from "metabook-firebase-support";
import { getDatabase } from "./firebase";
import { updatePromptStateCacheWithLog } from "./promptStates";

export async function storeLogs(logs: ActionLog[], userID: string) {
  // These logs will all end up with the same server timestamp, which create a lot of flailing in onLogCreate, since execution order is not guaranteed. We'll go ahead and compute the new prompt states right here.
  const storedLogs = await _storeLogs(
    logs,
    userID,
    getDatabase(),
    firebase.firestore.Timestamp.now(),
    (ms: number, ns: number) => new firebase.firestore.Timestamp(ms, ns),
    true,
  );

  // Apply each log sequentially, with a separate transaction for each. This is a bit wasteful.
  for (const [, log] of storedLogs) {
    await updatePromptStateCacheWithLog(log, userID);
  }

  // TODO: log each...
}
