import { PromptState } from "metabook-core";
import { MetabookActionLog } from "../types/actionLog";

export function getNextPromptStateForActionLog(
  log: MetabookActionLog,
): PromptState {
  return {
    dueTimestampMillis: log.nextDueTimestamp.toMillis(),
    interval: log.nextIntervalMillis,
    bestInterval: log.nextBestIntervalMillis,
    needsRetry: log.nextNeedsRetry,
  };
}
