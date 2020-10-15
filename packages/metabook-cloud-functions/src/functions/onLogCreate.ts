import firebase from "firebase-admin";
import * as functions from "firebase-functions";
import { ActionLogDocument } from "metabook-firebase-support";
import { updatePromptStateCacheWithLog } from "../firebase";
import { defaultLoggingService } from "../logging";

export default functions.firestore
  .document("users/{userID}/logs/{logID}")
  .onCreate(async (snapshot, context) => {
    const actionLog = snapshot.data() as ActionLogDocument<
      firebase.firestore.Timestamp
    >;

    const userID = context.params["userID"];
    if (!actionLog.suppressTaskStateCacheUpdate) {
      const newPromptStateCache = await updatePromptStateCacheWithLog(
        actionLog,
        userID,
      );
      await defaultLoggingService.logActionLog(
        userID,
        actionLog,
        newPromptStateCache,
      );
    }
  });
