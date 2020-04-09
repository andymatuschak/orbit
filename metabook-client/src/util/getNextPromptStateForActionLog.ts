import { getNextTaskParameters, PromptSpec, PromptState } from "metabook-core";
import { MetabookReviewActionLog } from "../types/actionLog";

export function getNextPromptStateForReviewLog(
  log: MetabookReviewActionLog,
  promptSpec: PromptSpec,
): PromptState {
  return {
    dueTimestampMillis: log.nextDueTimestamp.toMillis(),
    interval: log.nextIntervalMillis,
    bestInterval: log.nextBestIntervalMillis,
    needsRetry: log.nextNeedsRetry,
    taskParameters: getNextTaskParameters(
      promptSpec,
      log.promptTask.parameters,
    ),
  };
}
