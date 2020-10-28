import firebase from "firebase-admin";
import * as functions from "firebase-functions";
import { ActionLogDocument, PromptStateCache } from "metabook-firebase-support";
import * as backend from "../backend";
import { defaultLoggingService } from "../logging";

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

    const userID = context.params["userID"];
    // TODO: I don't like that this flag is suppressing unrelated logic... probably needs to be refactored.
    if (!actionLog.suppressTaskStateCacheUpdate) {
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

      await defaultLoggingService.logActionLog(
        userID,
        actionLog,
        newPromptStateCache,
      );
    }
  });
