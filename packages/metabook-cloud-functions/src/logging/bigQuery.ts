import * as BigQuery from "@google-cloud/bigquery";
import crypto from "crypto";
import admin from "firebase-admin";
import { ActionLogID, ActionLogType, getIDForActionLog } from "metabook-core";
import {
  ActionLogDocument,
  getPromptStateFromPromptStateCache,
  PromptStateCache,
} from "metabook-firebase-support";
import path from "path";
import serviceConfig from "../serviceConfig";
import {
  LogBase,
  LoggingService,
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

function convertFirestoreTimestamp(timestamp: number): BigQueryTimestamp {
  return getBigQuery().timestamp(new Date(timestamp))
    .value as BigQueryTimestamp;
}

async function logEvent(
  tableName: "userEvents",
  data: LogBase & {
    eventName: UserEventName;
    dataJSON: string;
  },
): Promise<unknown>;
async function logEvent(
  tableName: "actionLogs",
  data: LogBase & {
    serverTimestamp: BigQueryTimestamp;
    actionLogType: ActionLogType;
    actionLogID: ActionLogID;
    parentActionLogIDs: ActionLogID[];
    dataJSON: string;
    taskID: string | null;
    newTaskStateJSON: string | null;
  },
): Promise<unknown>;
async function logEvent<T extends LogBase>(
  tableName: string,
  data: T,
): Promise<unknown> {
  const table = getTable(tableName);
  const logArgs = {
    ...data,
    timestamp: convertFirestoreTimestamp(data.timestamp),
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

const bigqueryService: LoggingService = {
  logUserEvent(log: UserEventLog): Promise<unknown> {
    const { userID, timestamp, eventName, ...rest } = log;
    const bqLog = {
      userID,
      timestamp,
      eventName,
      dataJSON: JSON.stringify(rest),
    };
    return logEvent("userEvents", bqLog);
  },

  async logActionLog(
    userID: string,
    actionLog: ActionLogDocument<admin.firestore.Timestamp>,
    newTaskStateCache: PromptStateCache,
  ): Promise<unknown> {
    const {
      timestampMillis,
      serverTimestamp,
      actionLogType,
      suppressTaskStateCacheUpdate,
      taskID,
      ...rest
    } = actionLog;
    let parentActionLogIDs: ActionLogID[] = [];

    let data: Omit<typeof rest, "parentActionLogIDs">;
    if ("parentActionLogIDs" in rest) {
      ({ parentActionLogIDs, ...data } = rest);
    } else {
      data = rest;
    }

    const bqLog = {
      userID,
      timestamp: timestampMillis,
      serverTimestamp: convertFirestoreTimestamp(serverTimestamp.toMillis()),
      actionLogType,
      actionLogID: await getIDForActionLog(actionLog),
      parentActionLogIDs,
      dataJSON: JSON.stringify(data),
      taskID,
      newTaskStateJSON: JSON.stringify(
        getPromptStateFromPromptStateCache(newTaskStateCache),
      ),
    };
    return logEvent("actionLogs", bqLog);
  },
};

export default bigqueryService;
