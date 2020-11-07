import firebase from "firebase-admin";
import * as functions from "firebase-functions";
import {
  ActionLogDocument,
  getPromptStateFromPromptStateCache,
  PromptStateCache,
} from "metabook-firebase-support";
import * as backend from "../backend";
import { sharedLoggingService } from "../logging";

// We reset the user's review session notification state when they review a prompt, unless they're just collecting it for the first time.
async function updateSessionNotificationStateIfNecessary(
  userID: string,
  oldPromptStateCache: PromptStateCache | null,
) {
  if (oldPromptStateCache) {
    await backend.users.clearUserSessionNotificationState(userID);
  }
}

export default functions.firestore
  .document("users/{userID}/logs/{logID}")
  .onCreate(async (snapshot, context) => {
    const actionLog = snapshot.data() as ActionLogDocument<
      firebase.firestore.Timestamp
    >;

    // TODO: I don't like that this flag is suppressing unrelated logic... probably needs to be refactored.
    if (!actionLog.suppressTaskStateCacheUpdate) {
      const userID = context.params["userID"];
      const {
        oldPromptStateCache,
        newPromptStateCache,
      } = await backend.promptStates.updatePromptStateCacheWithLog(
        actionLog,
        userID,
      );

      await updateSessionNotificationStateIfNecessary(
        userID,
        oldPromptStateCache,
      );

      await sharedLoggingService.logActionLog(
        userID,
        actionLog,
        getPromptStateFromPromptStateCache(newPromptStateCache),
      );
    }
  });
