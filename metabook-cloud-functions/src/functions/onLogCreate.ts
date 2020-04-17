import firebase from "firebase-admin";
import * as functions from "firebase-functions";
import { ActionLogDocument } from "metabook-firebase-shared";
import { updatePromptStateCacheWithLog } from "../firebase";

export default functions.firestore
  .document("users/{userID}/logs/{logID}")
  .onCreate(async (snapshot, context) => {
    const actionLog = snapshot.data() as ActionLogDocument<
      firebase.firestore.Timestamp
    >;
    await updatePromptStateCacheWithLog(actionLog, context.params["userID"]);
  });
