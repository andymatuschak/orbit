import { ActionLogID } from "../actionLogID";

interface BaseActionLog {
  actionLogType: ActionLogType;
  timestampMillis: number;
}

export const ingestActionLogType = "ingest";
export interface IngestActionLog extends BaseActionLog {
  actionLogType: typeof ingestActionLogType;
  taskID: string;
}

export const repetitionActionLogType = "repetition";
export interface RepetitionActionLog extends BaseActionLog {
  actionLogType: typeof repetitionActionLogType;
  parentActionLogIDs: ActionLogID[];

  taskID: string;
  taskParameters: string | null;

  context: string | null;
  outcome: string;
}

export type ActionLog = IngestActionLog | RepetitionActionLog;

export type ActionLogType = ActionLog["actionLogType"];
