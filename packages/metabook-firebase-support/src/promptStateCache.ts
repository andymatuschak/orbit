import { PromptState, PromptTaskID } from "metabook-core";
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
    taskID,
    creationServerTimestamp,
    latestLogServerTimestamp,
    ...promptState
  } = promptStateCache;
  return promptState;
}
