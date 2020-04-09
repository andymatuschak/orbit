import { getNextTaskParameters, Prompt, PromptState } from "metabook-core";
import { MetabookReviewActionLog } from "../types/actionLog";

export function getNextPromptStateForReviewLog(
  log: MetabookReviewActionLog,
  prompt: Prompt,
): PromptState {
  return {
    dueTimestampMillis: log.nextDueTimestamp.toMillis(),
    interval: log.nextIntervalMillis,
    bestInterval: log.nextBestIntervalMillis,
    needsRetry: log.nextNeedsRetry,
    taskParameters: getNextTaskParameters(
      prompt,
      log.promptTaskParameters,
    ),
  };
}
