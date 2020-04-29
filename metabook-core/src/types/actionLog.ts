import { ActionLogID } from "../actionLogID";

type BaseActionLog = {
  timestampMillis: number;
  taskID: string;
};

export type ActionLogMetadata = { [key: string]: string | number | null };

export const ingestActionLogType = "ingest";
export type IngestActionLog = {
  actionLogType: typeof ingestActionLogType;
  metadata: ActionLogMetadata | null;
} & BaseActionLog;

export const repetitionActionLogType = "repetition";
export type RepetitionActionLog = {
  actionLogType: typeof repetitionActionLogType;
  parentActionLogIDs: ActionLogID[];

  taskParameters: ActionLogMetadata | null;

  context: string | null;
  outcome: string;
} & BaseActionLog;

export const rescheduleActionLogType = "reschedule";
export type RescheduleActionLog = {
  actionLogType: typeof rescheduleActionLogType;
  parentActionLogIDs: ActionLogID[];

  newTimestampMillis: number;
} & BaseActionLog;

export type ActionLog =
  | IngestActionLog
  | RepetitionActionLog
  | RescheduleActionLog;
export type ActionLogType = ActionLog["actionLogType"];
