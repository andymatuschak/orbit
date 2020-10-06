import { PromptState, PromptTaskID } from "metabook-core";
import { ServerTimestamp } from "./libraryAbstraction";

export interface PromptStateCache extends PromptState {
  taskID: PromptTaskID;
  latestLogServerTimestamp: ServerTimestamp;
}

export function getPromptStateFromPromptStateCache(
  promptStateCache: PromptStateCache,
): PromptState {
  const { taskID, latestLogServerTimestamp, ...promptState } = promptStateCache;
  return promptState;
}
