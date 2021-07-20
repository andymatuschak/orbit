import { PromptState, PromptTaskID } from "@withorbit/core";
import firebase from "firebase-admin";

export interface PromptStateCache extends PromptState {
  taskID: PromptTaskID;
  creationServerTimestamp: firebase.firestore.Timestamp;
  latestLogServerTimestamp: firebase.firestore.Timestamp;
}

export function getPromptStateFromPromptStateCache(
  promptStateCache: PromptStateCache,
): PromptState {
  const {
    taskID, // eslint-disable-line @typescript-eslint/no-unused-vars
    creationServerTimestamp, // eslint-disable-line @typescript-eslint/no-unused-vars
    latestLogServerTimestamp, // eslint-disable-line @typescript-eslint/no-unused-vars
    ...promptState
  } = promptStateCache;
  return promptState;
}
