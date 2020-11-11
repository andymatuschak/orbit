import * as firebase from "firebase-admin";
import { ActionLog, PromptState } from "metabook-core";
import {
  ActionLogDocument,
  getPromptStateFromPromptStateCache,
  ServerTimestamp,
  storeLogs as _storeLogs,
} from "metabook-firebase-support";
import { getDatabase } from "./firebase";
import { updatePromptStateCacheWithLog } from "./promptStates";

// Returns an array of the stored log documents and their corresponding prompt states.
export async function storeLogs(
  logs: ActionLog[],
  userID: string,
): Promise<
  {
    logDocument: ActionLogDocument<ServerTimestamp>;
    promptState: PromptState;
  }[]
> {
  // These logs will all end up with the same server timestamp, which create a lot of flailing in onLogCreate, since execution order is not guaranteed. We'll go ahead and compute the new prompt states right here.
  const storedLogs = await _storeLogs(
    logs,
    userID,
    getDatabase(),
    firebase.firestore.Timestamp.now(),
    true,
  );

  // Apply each log sequentially, with a separate transaction for each. This is a bit wasteful.
  const newPromptStates: {
    logDocument: ActionLogDocument<ServerTimestamp>;
    promptState: PromptState;
  }[] = [];
  for (const [, log] of storedLogs) {
    const { newPromptStateCache } = await updatePromptStateCacheWithLog(
      log,
      userID,
    );
    newPromptStates.push({
      logDocument: log,
      promptState: getPromptStateFromPromptStateCache(newPromptStateCache),
    });
  }

  return newPromptStates;
}
