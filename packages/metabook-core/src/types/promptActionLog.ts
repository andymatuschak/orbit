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
import { PromptTaskID } from "./promptTask";
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

export type PromptUpdateMetadataActionLog = Omit<
  UpdateMetadataActionLog,
  "taskID"
> & { taskID: PromptTaskID };

export type PromptActionLog<P extends PromptTaskParameters> =
  | PromptIngestActionLog
  | PromptRepetitionActionLog<P>
  | PromptRescheduleActionLog
  | PromptUpdateMetadataActionLog;

export function getActionLogFromPromptActionLog<P extends PromptTaskParameters>(
  promptActionLog: PromptActionLog<P>,
): ActionLog {
  switch (promptActionLog.actionLogType) {
    case ingestActionLogType:
      const { provenance, ...rest } = promptActionLog;
      return {
        ...rest,
        metadata: provenance,
      };
    case repetitionActionLogType:
      return promptActionLog;
    case rescheduleActionLogType:
      return promptActionLog;
    case updateMetadataActionLogType:
      return promptActionLog;
  }
}

export function getPromptActionLogFromActionLog(
  actionLog: ActionLog,
): PromptActionLog<PromptTaskParameters> {
  const taskID = actionLog.taskID as PromptTaskID;
  switch (actionLog.actionLogType) {
    case ingestActionLogType:
      const { metadata, ...rest } = actionLog;
      return {
        ...rest,
        taskID,
        provenance: metadata as PromptProvenance | null,
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
      return { ...actionLog, taskID };
  }
}
