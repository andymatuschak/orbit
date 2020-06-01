import { ActionLogID, getIDForActionLog } from "../actionLogID";
import { PromptRepetitionOutcome } from "../spacedRepetition/spacedRepetition";
import {
  ActionLog,
  ingestActionLogType,
  repetitionActionLogType,
  rescheduleActionLogType,
  UpdateMetadataActionLog,
  updateMetadataActionLogType,
} from "./actionLog";
import { PromptProvenance } from "./promptProvenance";
import { PromptTaskID, PromptTaskMetadata } from "./promptTask";
import { PromptTaskParameters } from "./promptTaskParameters";

// Prompt-specific definitions of ActionLog which include domain-specific narrowings of relevant fields.

type BasePromptActionLog = {
  timestampMillis: number;
};

export type PromptIngestActionLog = {
  actionLogType: typeof ingestActionLogType;
  taskID: PromptTaskID;
  provenance: PromptProvenance | null;
} & BasePromptActionLog;

export type PromptRepetitionActionLog<P extends PromptTaskParameters> = {
  actionLogType: typeof repetitionActionLogType;
  parentActionLogIDs: ActionLogID[];

  taskID: PromptTaskID;
  taskParameters: P;

  context: string | null;
  outcome: PromptRepetitionOutcome;
} & BasePromptActionLog;

export type PromptRescheduleActionLog = {
  actionLogType: typeof rescheduleActionLogType;
  parentActionLogIDs: ActionLogID[];

  taskID: PromptTaskID;
  newTimestampMillis: number;
} & BasePromptActionLog;

export type PromptUpdateMetadataActionLog = UpdateMetadataActionLog & {
  taskID: PromptTaskID;
  updates: Partial<PromptTaskMetadata>;
};

export type PromptActionLog<
  P extends PromptTaskParameters = PromptTaskParameters
> =
  | PromptIngestActionLog
  | PromptRepetitionActionLog<P>
  | PromptRescheduleActionLog
  | PromptUpdateMetadataActionLog;

export function getActionLogFromPromptActionLog<P extends PromptTaskParameters>(
  promptActionLog: PromptActionLog<P>,
): ActionLog {
  return promptActionLog;
}

export function getPromptActionLogFromActionLog(
  actionLog: ActionLog,
): PromptActionLog<PromptTaskParameters> {
  const taskID = actionLog.taskID as PromptTaskID;
  switch (actionLog.actionLogType) {
    case ingestActionLogType:
      const { provenance, ...restIngest } = actionLog;
      return {
        ...restIngest,
        taskID,
        provenance: provenance as PromptProvenance | null,
      };
    case repetitionActionLogType:
      if (
        actionLog.outcome === PromptRepetitionOutcome.Forgotten ||
        actionLog.outcome === PromptRepetitionOutcome.Remembered
      ) {
        return {
          ...actionLog,
          taskID,
          taskParameters: actionLog.taskParameters as PromptTaskParameters,
          outcome: actionLog.outcome as PromptRepetitionOutcome,
        };
      } else {
        throw new Error(
          `Unknown outcome ${
            actionLog.outcome
          } in action log ${getIDForActionLog(actionLog)}`,
        );
      }
    case rescheduleActionLogType:
      return { ...actionLog, taskID };
    case updateMetadataActionLogType:
      const { updates, ...restUpdate } = actionLog;
      return {
        ...restUpdate,
        taskID,
        updates: updates as Partial<PromptTaskMetadata>,
      };
  }
}
