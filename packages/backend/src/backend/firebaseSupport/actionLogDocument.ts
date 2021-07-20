import { ActionLog } from "@withorbit/core";
import firebase from "firebase-admin";

export type ActionLogDocument = ActionLog & {
  serverTimestamp: firebase.firestore.Timestamp;
  suppressTaskStateCacheUpdate?: boolean;
};

export function getActionLogFromActionLogDocument(
  document: ActionLogDocument,
): ActionLog {
  const {
    serverTimestamp, // eslint-disable-line @typescript-eslint/no-unused-vars
    suppressTaskStateCacheUpdate, // eslint-disable-line @typescript-eslint/no-unused-vars
    ...actionLog
  } = document;
  return actionLog;
}
