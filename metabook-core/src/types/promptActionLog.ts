import { ActionLogID, getIDForActionLog } from "../actionLogID";
import { PromptRepetitionOutcome } from "../spacedRepetition/spacedRepetition";
import {
  ActionLog,
  ActionLogType,
  ingestActionLogType,
  repetitionActionLogType,
} from "./actionLog";
import { PromptTaskID } from "./promptTask";
import { PromptTaskParameters } from "./promptTaskParameters";

// Prompt-specific definitions of ActionLog which include domain-specific narrowings of relevant fields.

interface BasePromptActionLog {
  actionLogType: ActionLogType;
  timestampMillis: number;
}

export interface PromptIngestActionLog extends BasePromptActionLog {
  actionLogType: typeof ingestActionLogType;
  taskID: PromptTaskID;
}

export interface PromptRepetitionActionLog<P extends PromptTaskParameters>
  extends BasePromptActionLog {
  actionLogType: typeof repetitionActionLogType;
  parentActionLogIDs: ActionLogID[];

  taskID: PromptTaskID;
  taskParameters: P;

  context: string | null;
  outcome: PromptRepetitionOutcome;
}

export type PromptActionLog<P extends PromptTaskParameters> =
  | PromptIngestActionLog
  | PromptRepetitionActionLog<P>;

export function getActionLogFromPromptActionLog<P extends PromptTaskParameters>(
  promptActionLog: PromptActionLog<P>,
): ActionLog {
  switch (promptActionLog.actionLogType) {
    case ingestActionLogType:
      return promptActionLog;
    case repetitionActionLogType:
      return {
        ...promptActionLog,
        taskParameters:
          promptActionLog.taskParameters &&
          JSON.stringify(promptActionLog.taskParameters),
      };
  }
}

export function getPromptActionLogFromActionLog<P extends PromptTaskParameters>(
  actionLog: ActionLog,
): PromptActionLog<P> {
  const taskID = actionLog.taskID as PromptTaskID;
  switch (actionLog.actionLogType) {
    case ingestActionLogType:
      return { ...actionLog, taskID };
    case repetitionActionLogType:
      if (
        actionLog.outcome === PromptRepetitionOutcome.Forgotten ||
        actionLog.outcome === PromptRepetitionOutcome.Remembered
      ) {
        return {
          ...actionLog,
          taskID,
          taskParameters: (actionLog.taskParameters &&
            JSON.parse(actionLog.taskParameters)) as P,
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
