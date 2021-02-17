import * as BigQuery from "@google-cloud/bigquery";
import crypto from "crypto";
import {
  ActionLog,
  ActionLogID,
  ActionLogType,
  getIDForActionLog,
  PromptState,
} from "metabook-core";
import {
  ActionLogDocument,
  ServerTimestamp,
  serverTimestampToTimestampMillis,
} from "metabook-firebase-support";
import path from "path";
import serviceConfig from "../serviceConfig";
import {
  ActionLogLog,
  DataRecordLog,
  LoggingService,
  PageViewLog,
  SessionNotificationLog,
  UserEventLog,
  UserEventName,
} from "./interface";

let _bigQuery: BigQuery.BigQuery | null = null;
let _logsDataset: BigQuery.Dataset | null = null;

function getBigQuery(): BigQuery.BigQuery {
  if (!_bigQuery) {
    if (process.env["SERVICE_ACCOUNT_PATH"]) {
      _bigQuery = new BigQuery.BigQuery({
        keyFilename: path.resolve(
          process.cwd(),
          process.env["SERVICE_ACCOUNT_PATH"]!,
        ),
        projectId: serviceConfig.bigQuery.projectId,
      });
    } else {
      _bigQuery = new BigQuery.BigQuery();
    }
  }
  return _bigQuery;
}

function getTable(tableName: string) {
  if (!_logsDataset) {
    _logsDataset = getBigQuery().dataset(serviceConfig.bigQuery.logDatasetName);
  }
  return _logsDataset.table(tableName);
}

type BigQueryTimestamp = string & { __bigQueryTimestampOpaqueID: never };
type WithBigQueryTimestamp<T> = Omit<T, "timestamp"> & {
  timestamp: BigQueryTimestamp;
};

function createBigQueryTimestamp(timestamp: number): BigQueryTimestamp {
  return getBigQuery().timestamp(new Date(timestamp))
    .value as BigQueryTimestamp;
}

async function logEvent(
  tableName: "userEvents",
  data: {
    userID: string;
    timestamp: BigQueryTimestamp;
    eventName: UserEventName;
    dataJSON: string;
  },
): Promise<unknown>;
async function logEvent(
  tableName: "actionLogs",
  data: {
    userID: string;
    timestamp: BigQueryTimestamp;
    serverTimestamp: BigQueryTimestamp;
    actionLogType: ActionLogType;
    actionLogID: ActionLogID;
    parentActionLogIDs: ActionLogID[];
    dataJSON: string;
    taskID: string | null;
    newTaskStateJSON: string | null;
  },
): Promise<unknown>;
async function logEvent(
  tableName: "pageViews",
  data: WithBigQueryTimestamp<PageViewLog>,
): Promise<unknown>;
async function logEvent(
  tableName: "sessionNotifications",
  data: Omit<WithBigQueryTimestamp<SessionNotificationLog>, "emailSpec"> & {
    emailJSON: string;
  },
): Promise<unknown>;
async function logEvent(
  tableName: "dataRecords",
  data: Omit<WithBigQueryTimestamp<DataRecordLog>, "record"> & {
    dataJSON: string;
  },
): Promise<unknown>;
async function logEvent<T>(tableName: string, data: T): Promise<unknown> {
  const table = getTable(tableName);
  const logArgs = {
    ...data,
  };

  // Cloud functions aren't guaranteed to execute exactly once, so we try to make them idempotent. BigQuery will attempt to deduplicate logs on a short buffer with the same "insertID"; we use the hash of the log data as the insert ID.
  const logHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(logArgs))
    .digest("base64");

  return table
    .insert(
      {
        json: logArgs,
        insertID: logHash,
      },
      { raw: true },
    )
    .catch((reason) => {
      console.error("Couldn't log:", JSON.stringify(reason));
      return Promise.reject(reason);
    });
}

export const bigQueryLoggingService: LoggingService = {
  logUserEvent(log: UserEventLog): Promise<unknown> {
    const { userID, timestamp, eventName, ...rest } = log;
    const bqLog = {
      userID,
      timestamp: createBigQueryTimestamp(timestamp),
      eventName,
      dataJSON: JSON.stringify(rest),
    };
    return logEvent("userEvents", bqLog);
  },

  async logActionLog({
    userID,
    actionLog,
    serverTimestamp,
    newTaskState,
  }: ActionLogLog): Promise<unknown> {
    const { timestampMillis, actionLogType, taskID, ...rest } = actionLog;
    let parentActionLogIDs: ActionLogID[] = [];

    let data: Omit<typeof rest, "parentActionLogIDs">;
    if ("parentActionLogIDs" in rest) {
      ({ parentActionLogIDs, ...data } = rest);
    } else {
      data = rest;
    }

    const bqLog = {
      userID,
      timestamp: createBigQueryTimestamp(timestampMillis),
      serverTimestamp: createBigQueryTimestamp(serverTimestamp),
      actionLogType,
      actionLogID: await getIDForActionLog(actionLog),
      parentActionLogIDs,
      dataJSON: JSON.stringify(data),
      taskID,
      newTaskStateJSON: JSON.stringify(newTaskState),
    };
    return logEvent("actionLogs", bqLog);
  },

  logPageView(log: PageViewLog): Promise<unknown> {
    return logEvent("pageViews", {
      ...log,
      timestamp: createBigQueryTimestamp(log.timestamp),
    });
  },

  logSessionNotification(log: SessionNotificationLog): Promise<unknown> {
    const { emailSpec, ...rest } = log;
    return logEvent("sessionNotifications", {
      ...rest,
      timestamp: createBigQueryTimestamp(log.timestamp),
      emailJSON: JSON.stringify(emailSpec),
    });
  },

  logDataRecord(log: DataRecordLog): Promise<unknown> {
    const { record, ...rest } = log;
    return logEvent("dataRecords", {
      ...rest,
      timestamp: createBigQueryTimestamp(log.timestamp),
      dataJSON: JSON.stringify(record),
    });
  },
};
