import { ActionLogID } from "../actionLogID";
import { getNextRepetitionInterval } from "../spacedRepetition/getNextRepetitionInterval";
import {
  getInitialIntervalForSchedule,
  MetabookSpacedRepetitionSchedule,
  PromptRepetitionOutcome,
} from "../spacedRepetition/spacedRepetition";
import {
  ingestActionLogType,
  repetitionActionLogType,
  rescheduleActionLogType,
  updateMetadataActionLogType,
} from "../types/actionLog";
import { applicationPromptType } from "../types/prompt";
import {
  PromptActionLog,
  PromptRepetitionActionLog,
} from "../types/promptActionLog";
import { PromptProvenance } from "../types/promptProvenance";
import { getPromptTaskForID, PromptTaskMetadata } from "../types/promptTask";
import { PromptTaskParameters } from "../types/promptTaskParameters";
import { PromptState } from "./promptState";

function getInitialPromptTaskMetadata(provenance: PromptProvenance | null) {
  return {
    isDeleted: false,
    provenance,
  };
}

export function updateBaseHeadActionLogIDs(
  baseHeadActionLogIDs: ActionLogID[],
  newActionLogParentLogIDs: ActionLogID[],
  newActionLogID: ActionLogID,
): ActionLogID[] {
  // The new action log's parent log IDs supplant all the logs listed as its parents.
  const output: ActionLogID[] = [];
  let alreadyIncludesNewActionLogID = false;
  for (const baseHeadActionLogID of baseHeadActionLogIDs) {
    if (!newActionLogParentLogIDs.includes(baseHeadActionLogID)) {
      output.push(baseHeadActionLogID);
    }
    if (baseHeadActionLogID === newActionLogID) {
      alreadyIncludesNewActionLogID = true;
    }
  }
  if (!alreadyIncludesNewActionLogID) {
    output.push(newActionLogID);
  }
  return output;
}

function applyPromptRepetitionActionLogToPromptState<
  P extends PromptTaskParameters
>(
  promptActionLog: PromptRepetitionActionLog<P>,
  actionLogID: ActionLogID,
  basePromptState: PromptState | null,
  schedule: MetabookSpacedRepetitionSchedule,
): PromptState | Error {
  const promptTask = getPromptTaskForID(promptActionLog.taskID);
  if (promptTask instanceof Error) {
    return new Error(
      `Couldn't decode prompt task ID ${promptActionLog.taskID}: ${promptTask.message}`,
    );
  }

  const supportsRetry = promptTask?.promptType !== applicationPromptType;

  const currentReviewInterval = basePromptState
    ? Math.max(
        0,
        promptActionLog.timestampMillis -
          basePromptState.lastReviewTimestampMillis,
      )
    : 0;
  const currentBestInterval = basePromptState
    ? basePromptState.bestIntervalMillis
    : null;

  const currentlyNeedsRetry =
    (basePromptState && basePromptState.needsRetry) || false;

  const newInterval = getNextRepetitionInterval({
    schedule: schedule,
    reviewIntervalMillis: currentReviewInterval,
    scheduledIntervalMillis: basePromptState?.intervalMillis || null,
    outcome: promptActionLog.outcome,
    supportsRetry,
    currentlyNeedsRetry,
  });

  // We'll generate a small offset, so that cards don't always end up in the same order. Here the maximum jitter is 10 minutes.
  const jitter = (promptActionLog.timestampMillis % 1000) * (60 * 10);

  let newDueTimestampMillis: number;
  if (
    supportsRetry &&
    promptActionLog.outcome === PromptRepetitionOutcome.Forgotten
  ) {
    // Assign it to be due in 10 minutes or so.
    newDueTimestampMillis = promptActionLog.timestampMillis + 300 + jitter;
  } else {
    newDueTimestampMillis =
      promptActionLog.timestampMillis + newInterval + jitter;
  }

  return {
    headActionLogIDs: updateBaseHeadActionLogIDs(
      basePromptState?.headActionLogIDs ?? [],
      promptActionLog.parentActionLogIDs,
      actionLogID,
    ),
    lastReviewTimestampMillis: promptActionLog.timestampMillis,
    dueTimestampMillis: newDueTimestampMillis,
    bestIntervalMillis:
      promptActionLog.outcome === PromptRepetitionOutcome.Remembered
        ? Math.max(currentBestInterval || 0, currentReviewInterval)
        : currentBestInterval,
    needsRetry:
      supportsRetry &&
      promptActionLog.outcome === PromptRepetitionOutcome.Forgotten,
    taskMetadata:
      basePromptState?.taskMetadata ??
      getInitialPromptTaskMetadata(
        basePromptState?.taskMetadata.provenance ?? null,
      ),
    intervalMillis: newInterval,
    lastReviewTaskParameters: promptActionLog.taskParameters,
  };
}

export default function applyActionLogToPromptState<
  P extends PromptTaskParameters
>({
  promptActionLog,
  actionLogID,
  basePromptState,
  schedule,
}: {
  promptActionLog: PromptActionLog<P>;
  actionLogID: ActionLogID;
  basePromptState: PromptState | null;
  schedule: MetabookSpacedRepetitionSchedule;
}): PromptState | Error {
  const initialInterval = getInitialIntervalForSchedule("default");
  switch (promptActionLog.actionLogType) {
    case ingestActionLogType:
      if (basePromptState) {
        // Later ingests mostly don't impact the state; we just fast-forward to include this log.
        let taskMetadata: PromptTaskMetadata;
        if (basePromptState.taskMetadata.isDeleted) {
          taskMetadata = {
            ...basePromptState.taskMetadata,
            isDeleted: false,
            provenance: promptActionLog.provenance,
          };
        } else {
          taskMetadata = basePromptState.taskMetadata;
        }
        return {
          ...basePromptState,
          taskMetadata,
          headActionLogIDs: updateBaseHeadActionLogIDs(
            basePromptState.headActionLogIDs,
            [],
            actionLogID,
          ),
        };
      } else {
        return {
          headActionLogIDs: [actionLogID],
          lastReviewTimestampMillis: promptActionLog.timestampMillis,
          lastReviewTaskParameters: null,
          dueTimestampMillis: promptActionLog.timestampMillis,
          needsRetry: false,
          taskMetadata: getInitialPromptTaskMetadata(
            promptActionLog.provenance,
          ),
          intervalMillis: initialInterval,
          bestIntervalMillis: null,
        };
      }
    case repetitionActionLogType:
      return applyPromptRepetitionActionLogToPromptState(
        promptActionLog,
        actionLogID,
        basePromptState,
        schedule,
      );
    case rescheduleActionLogType:
      if (basePromptState) {
        return {
          ...basePromptState,
          dueTimestampMillis: promptActionLog.newTimestampMillis,
        };
      } else {
        return new Error("Can't reschedule a prompt with no prior actions");
      }
    case updateMetadataActionLogType:
      if (basePromptState) {
        return {
          ...basePromptState,
          taskMetadata: {
            ...basePromptState.taskMetadata,
            ...promptActionLog.updates,
          },
        };
      } else {
        return new Error("Can't reschedule a prompt with no prior actions");
      }
  }
}
