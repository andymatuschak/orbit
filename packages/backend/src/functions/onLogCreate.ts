import {
  ActionLogDocument,
  getPromptStateFromPromptStateCache,
  serverTimestampToTimestampMillis,
} from "../backend/firebaseSupport";
import * as functions from "firebase-functions";
import * as backend from "../backend";
import { sharedLoggingService } from "../logging";

// TODO: Remove this function once recordEmbeddedActions is gone.
export default functions.firestore
  .document("users/{userID}/logs/{logID}")
  .onCreate(async (snapshot, context) => {
    const actionLog = snapshot.data() as ActionLogDocument;

    // TODO: I don't like that this flag is suppressing unrelated logic... probably needs to be refactored.
    if (!actionLog.suppressTaskStateCacheUpdate) {
      const userID = context.params["userID"];
      const { newPromptStateCache } =
        await backend.promptStates.updatePromptStateCacheWithLog(
          actionLog,
          userID,
        );

      await sharedLoggingService.logActionLog({
        userID: userID,
        actionLog: actionLog,
        serverTimestamp: serverTimestampToTimestampMillis(
          actionLog.serverTimestamp,
        ),
        newTaskState: getPromptStateFromPromptStateCache(newPromptStateCache),
      });
    }
  });
