import { PromptState, PromptTaskID } from "@withorbit/core";
import { ServerTimestamp } from "./libraryAbstraction";

export interface PromptStateCache extends PromptState {
  taskID: PromptTaskID;
  creationServerTimestamp: ServerTimestamp;
  latestLogServerTimestamp: ServerTimestamp;
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
