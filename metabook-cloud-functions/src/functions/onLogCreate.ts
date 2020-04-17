import * as functions from "firebase-functions";
import { ActionLog } from "metabook-core";
import { updatePromptStateCacheWithLog } from "../firebase";

export default functions.firestore
  .document("users/{userID}/logs/{logID}")
  .onCreate(async (snapshot, context) => {
    const actionLog = snapshot.data() as ActionLog;
    await updatePromptStateCacheWithLog(actionLog, context.params["userID"]);
  });
