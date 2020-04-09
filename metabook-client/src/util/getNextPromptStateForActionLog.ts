import {
  getNextTaskParameters,
  Prompt,
  PromptState,
  RepetitionActionLog,
} from "metabook-core";

export function getNextPromptStateForReviewLog(
  log: RepetitionActionLog,
  prompt: Prompt,
): PromptState {
  return {
    dueTimestampMillis: 0,
    interval: 0,
    bestInterval: null,
    needsRetry: false,
    taskParameters: null,
  };

  // TODO
}
