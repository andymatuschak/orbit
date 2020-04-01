import { PromptSpec, PromptState } from "metabook-core";
import getNextTaskParameters from "../../dist/util/getNextTaskParameters";
import { MetabookActionLog } from "../types/actionLog";

export function getNextPromptStateForActionLog(
  log: MetabookActionLog,
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
