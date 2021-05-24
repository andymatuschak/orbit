import { ActionLogID } from "../actionLogID";
import { TaskMetadata, TaskProvenance } from "./taskMetadata";

export interface BaseActionLog {
  timestampMillis: number;
  taskID: string;
}

export type ActionLogMetadata = { [key: string]: string | number | null };

export const ingestActionLogType = "ingest";
export interface IngestActionLog extends BaseActionLog {
  actionLogType: typeof ingestActionLogType;
  provenance: TaskProvenance | null;
}

export const repetitionActionLogType = "repetition";
export interface RepetitionActionLog extends BaseActionLog {
  actionLogType: typeof repetitionActionLogType;
  parentActionLogIDs: ActionLogID[];
  taskParameters: ActionLogMetadata | null;

  outcome: string;
  context: string | null;
}

export const rescheduleActionLogType = "reschedule";
export interface RescheduleActionLog extends BaseActionLog {
  actionLogType: typeof rescheduleActionLogType;
  parentActionLogIDs: ActionLogID[];

  newTimestampMillis: number;
}

export const updateMetadataActionLogType = "updateMetadata";
export interface UpdateMetadataActionLog extends BaseActionLog {
  actionLogType: typeof updateMetadataActionLogType;
  parentActionLogIDs: ActionLogID[];

  updates: Partial<TaskMetadata>;
}

export type ActionLog =
  | IngestActionLog
  | RepetitionActionLog
  | RescheduleActionLog
  | UpdateMetadataActionLog;
export type ActionLogType = ActionLog["actionLogType"];
