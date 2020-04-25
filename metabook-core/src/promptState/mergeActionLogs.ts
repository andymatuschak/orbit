import { ActionLogID, getIDForActionLog } from "../actionLogID";
import {
  ingestActionLogType,
  repetitionActionLogType,
} from "../types/actionLog";
import {
  getActionLogFromPromptActionLog,
  PromptActionLog,
} from "../types/promptActionLog";
import { PromptTaskParameters } from "../types/promptTaskParameters";
import applyActionLogToPromptState from "./applyActionLogToPromptState";
import promptActionLogCanBeAppliedToPromptState from "./promptActionLogCanBeAppliedToPromptState";
import { PromptState } from "./promptState";

class ActionLogMergeError extends Error {
  mergeLogErrorType: ActionLogMergeErrorType;
  constructor(mergeLogErrorType: ActionLogMergeErrorType, message: string) {
    super(message);
    this.name = "ActionLogMergeError";
    this.mergeLogErrorType = mergeLogErrorType;
  }
}

enum ActionLogMergeErrorType {
  DisconnectedBasePromptState = "disconnectedBasePromptState",
  MissingInternalLogs = "missingInternalLogs",
  InvalidLogSequence = "invalidLogSequence",
  InvalidLog = "invalidLog",
}

export default function mergeActionLogs(
  logs: Iterable<PromptActionLog<PromptTaskParameters>>,
  basePromptState: PromptState | null,
): PromptState | ActionLogMergeError {
  const actionLogIDs: Set<ActionLogID> = new Set();
  for (const log of logs) {
    actionLogIDs.add(getIDForActionLog(getActionLogFromPromptActionLog(log)));
  }
  if (actionLogIDs.size === 0) {
    throw new Error("mergeActionLogs requires at least one log");
  }

  // If the base prompt state is derived from some logs we don't know about (i.e. because we downloaded a remote cache), we can't merge.
  if (basePromptState) {
    const missingBasePromptHeadLogIDs = basePromptState.headActionLogIDs.filter(
      (id) => !actionLogIDs.has(id),
    );
    if (missingBasePromptHeadLogIDs.length > 0) {
      return new ActionLogMergeError(
        ActionLogMergeErrorType.DisconnectedBasePromptState,
        `base prompt state disconnected; unknown log IDs ${missingBasePromptHeadLogIDs.join(
          ", ",
        )}`,
      );
    }
  }

  // Are any logs missing?
  const missingLogIDs = new Set<ActionLogID>();
  for (const log of logs) {
    switch (log.actionLogType) {
      case ingestActionLogType:
        continue;
      case repetitionActionLogType:
        for (const parentID of log.parentActionLogIDs) {
          if (!actionLogIDs.has(parentID)) {
            missingLogIDs.add(parentID);
          }
        }
        break;
    }
  }
  if (missingLogIDs.size > 0) {
    return new ActionLogMergeError(
      ActionLogMergeErrorType.MissingInternalLogs,
      `missing internal log IDs ${[...missingLogIDs].join(", ")}`,
    );
  }

  // At least for review logs, we don't have to do any clever tree-based resolution: we can just flatten into a timestamp sequence and run through. This obviously won't work if a computer's clock is way off, but I'm not hugely worried about that.
  // TODO: at least do a sanity check that no log has an earlier timestamp than its parent
  const logsByTimestamp = [...logs].sort((a, b) => {
    if (a.timestampMillis === b.timestampMillis) {
      if (a.actionLogType === ingestActionLogType) {
        return -1;
      } else {
        return 1;
      }
    } else {
      return a.timestampMillis - b.timestampMillis;
    }
  });
  let runningBasePromptState: PromptState | null = null;
  for (const log of logsByTimestamp) {
    if (
      !promptActionLogCanBeAppliedToPromptState(log, runningBasePromptState)
    ) {
      return new ActionLogMergeError(
        ActionLogMergeErrorType.InvalidLogSequence,
        `invalid log sequence, possible bad clock. trying to apply ${JSON.stringify(
          log,
          null,
          "\t",
        )} to ${JSON.stringify(
          runningBasePromptState,
          null,
          "\t",
        )}.  Full sequence: ${JSON.stringify(logsByTimestamp, null, "\t")}`,
      );
    }
    const nextPromptState: PromptState | Error = applyActionLogToPromptState({
      basePromptState: runningBasePromptState,
      promptActionLog: log,
      schedule: "default",
    });
    if (nextPromptState instanceof Error) {
      return new ActionLogMergeError(
        ActionLogMergeErrorType.InvalidLog,
        `trying to merge invalid log ${JSON.stringify(log, null, "\t")}: ${
          nextPromptState.message
        }. Full sequence: ${JSON.stringify(logsByTimestamp, null, "\t")}`,
      );
    }
    runningBasePromptState = nextPromptState;
  }

  return runningBasePromptState!;
}
