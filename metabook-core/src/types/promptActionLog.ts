import { ActionLogID, getIDForActionLog } from "../actionLogID";
import { PromptRepetitionOutcome } from "../spacedRepetition/spacedRepetition";
import typedKeys from "../util/typedKeys";
import {
  ActionLog,
  ingestActionLogType,
  repetitionActionLogType,
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

export type PromptActionLog<P extends PromptTaskParameters> =
  | PromptIngestActionLog
  | PromptRepetitionActionLog<P>;

export function getActionLogFromPromptActionLog<P extends PromptTaskParameters>(
  promptActionLog: PromptActionLog<P>,
): ActionLog {
  switch (promptActionLog.actionLogType) {
    case ingestActionLogType:
      return {
        ...promptActionLog,
        metadata: promptActionLog.provenance,
      };
    case repetitionActionLogType:
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
  }
}
