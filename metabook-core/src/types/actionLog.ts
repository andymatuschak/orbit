import { ActionLogID } from "../actionLogID";
import { PromptID } from "../promptID";
import { MetabookActionOutcome } from "../spacedRepetition";
import { PromptParameters } from "./promptTask";
import { PromptTaskParameters } from "./promptTaskParameters";

interface BaseActionLog {
  actionLogType: ActionLogType;
  timestampMillis: number;
}

export const ingestActionLogType = "ingest";
export interface IngestActionLog extends BaseActionLog {
  actionLogType: typeof ingestActionLogType;
  promptID: PromptID;
  promptParameters: PromptParameters;
}

export const repetitionActionLogType = "repetition";
export interface RepetitionActionLog extends BaseActionLog {
  actionLogType: typeof repetitionActionLogType;
  promptID: PromptID;
  promptParameters: PromptParameters;
  promptTaskParameters: PromptTaskParameters;

  parentActionLogIDs: ActionLogID[];

  sessionID: string | null;
  actionOutcome: MetabookActionOutcome;
}

export type ActionLog = IngestActionLog | RepetitionActionLog;

export type ActionLogType = ActionLog["actionLogType"];
