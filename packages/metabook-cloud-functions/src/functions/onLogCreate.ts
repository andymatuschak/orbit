import firebase from "firebase-admin";
import * as functions from "firebase-functions";
import { ActionLogDocument } from "metabook-firebase-support";
import { updatePromptStateCacheWithLog } from "../firebase/firebase";

export default functions.firestore
  .document("users/{userID}/logs/{logID}")
  .onCreate(async (snapshot, context) => {
    const actionLog = snapshot.data() as ActionLogDocument<
      firebase.firestore.Timestamp
    >;
    console.log("New log");
    if (!actionLog.suppressTaskStateCacheUpdate) {
      await updatePromptStateCacheWithLog(actionLog, context.params["userID"]);
    }
  });
