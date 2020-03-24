import { CardState } from "metabook-core";
import { MetabookActionLog } from "../types/actionLog";

export function getNextCardStateForActionLog(
  log: MetabookActionLog,
): CardState {
  return {
    dueTime: log.nextDueTimestamp.toMillis(),
    interval: log.nextIntervalMillis,
    bestInterval: log.nextBestIntervalMillis,
    needsRetry: log.nextNeedsRetry,
    orderSeed: log.nextOrderSeed,
  };
}
