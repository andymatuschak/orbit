import { ActionLogID } from "../actionLogID";

type BaseActionLog = {
  timestampMillis: number;
};

export type ActionLogMetadata = { [key: string]: string | number };

export const ingestActionLogType = "ingest";
export type IngestActionLog = {
  actionLogType: typeof ingestActionLogType;
  taskID: string;
  metadata: ActionLogMetadata | null;
} & BaseActionLog;

export const repetitionActionLogType = "repetition";
export type RepetitionActionLog = {
  actionLogType: typeof repetitionActionLogType;
  parentActionLogIDs: ActionLogID[];

  taskID: string;
  taskParameters: ActionLogMetadata | null;

  context: string | null;
  outcome: string;
} & BaseActionLog;

export type ActionLog = IngestActionLog | RepetitionActionLog;
export type ActionLogType = ActionLog["actionLogType"];
