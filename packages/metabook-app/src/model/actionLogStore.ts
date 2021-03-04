import * as AbstractLeveldown from "abstract-leveldown";
import LevelUp, * as levelup from "levelup";
import * as lexi from "lexicographic-integer";

import { ActionLog, ActionLogID, PromptTaskID } from "metabook-core";
import sub from "subleveldown";
import RNLeveldown from "../util/leveldown";
import { getJSONRecord, saveJSONRecord } from "./levelDBUtil";

const latestCreatedSyncedLogID = "_latestCreatedSyncedLogID";
const hasCompletedInitialImportDBKey = "_hasFinishedInitialImport";

function getActionLogIDFromTaskIDIndexDBKey(key: string) {
  return key.split("!")[2] as ActionLogID;
}

export default class ActionLogStore {
  private readonly rootDB: levelup.LevelUp;
  private readonly actionLogDB: levelup.LevelUp;
  private readonly taskIDIndexDB: levelup.LevelUp;
  private readonly danglingTaskIDsIndexDB: levelup.LevelUp;

  private cachedLatestCreatedSyncedLogID: ActionLogID | null | undefined;
  private cachedHasFinishedInitialImport: boolean | undefined;

  constructor(storeName = "ActionLogStore") {
    this.rootDB = LevelUp(new RNLeveldown(storeName));
    this.actionLogDB = sub(this.rootDB, "logs");
    this.taskIDIndexDB = sub(this.rootDB, "taskIDIndex");
    this.danglingTaskIDsIndexDB = sub(this.rootDB, "danglingTaskIDsIndex"); // task IDs with merge errors
  }

  // i.e. the log ID corresponding to the most recently created task we've fetched--we use this for syncing
  async getLatestCreatedSyncedLogID(): Promise<ActionLogID | null> {
    if (this.cachedLatestCreatedSyncedLogID === undefined) {
      const result = await getJSONRecord(
        this.actionLogDB,
        latestCreatedSyncedLogID,
      );
      this.cachedLatestCreatedSyncedLogID =
        (result?.record as ActionLogID) ?? null;
    }
    return this.cachedLatestCreatedSyncedLogID ?? null;
  }

  async setLatestCreatedSyncedLogID(actionLogID: ActionLogID): Promise<void> {
    this.cachedLatestCreatedSyncedLogID = actionLogID;
    await saveJSONRecord(
      this.actionLogDB,
      latestCreatedSyncedLogID,
      actionLogID,
    );
  }

  async getHasFinishedInitialImport(): Promise<boolean> {
    if (this.cachedHasFinishedInitialImport === undefined) {
      const result = await getJSONRecord(
        this.actionLogDB,
        hasCompletedInitialImportDBKey,
      );
      this.cachedHasFinishedInitialImport = (result?.record as boolean) ?? null;
    }
    return this.cachedHasFinishedInitialImport ?? null;
  }

  async setHasFinishedInitialImport(): Promise<void> {
    await saveJSONRecord(
      this.actionLogDB,
      hasCompletedInitialImportDBKey,
      true,
    );
    this.cachedHasFinishedInitialImport = true;
  }

  async saveActionLogs(
    entries: Iterable<{
      log: ActionLog;
      id: ActionLogID;
    }>,
  ): Promise<void> {
    const operations: AbstractLeveldown.AbstractBatch[] = [];
    const taskIDIndexOperations: AbstractLeveldown.AbstractBatch[] = [];
    for (const { log, id } of entries) {
      const encodedLog = JSON.stringify(log);
      operations.push({ type: "put", key: id, value: encodedLog });
      taskIDIndexOperations.push({
        type: "put",
        key: `${log.taskID}!${lexi.pack(log.timestampMillis, "hex")}!${id}`,
        value: encodedLog,
      });
    }

    await Promise.all([
      this.actionLogDB.batch(operations),
      this.taskIDIndexDB.batch(taskIDIndexOperations),
    ]);
  }

  async getActionLog(id: ActionLogID): Promise<ActionLog | null> {
    const result = await getJSONRecord(this.actionLogDB, id);
    return (result?.record as ActionLog) ?? null;
  }

  async getActionLogsByTaskID(
    taskID: string,
    limit?: number,
  ): Promise<{ log: ActionLog; id: ActionLogID }[]> {
    return new Promise((resolve, reject) => {
      const output: { log: ActionLog; id: ActionLogID }[] = [];

      const iterator = this.taskIDIndexDB.iterator({
        keys: true,
        values: true,
        gte: taskID,
        lt: taskID + "~", // ~ is sorted after all ASCII characters
        limit: limit ?? -1,
        keyAsBuffer: false,
        valueAsBuffer: false,
      });
      async function iterate(
        error: Error | undefined,
        key: string | undefined,
        value: string | undefined,
      ) {
        if (error) {
          reject(error);
        } else if (key && value) {
          const id = getActionLogIDFromTaskIDIndexDBKey(key);
          const log = JSON.parse(value) as ActionLog;
          output.push({ log, id });
          iterator.next(iterate);
        } else {
          iterator.end((error) => (error ? reject(error) : resolve(output)));
        }
      }
      iterator.next(iterate);
    });
  }

  async getDanglingTaskIDs(): Promise<PromptTaskID[]> {
    return new Promise((resolve, reject) => {
      const output: PromptTaskID[] = [];

      const iterator = this.danglingTaskIDsIndexDB.iterator({
        keys: true,
        values: false,
      });
      function iterate(error: Error | undefined, key: string) {
        if (error) {
          reject(error);
        } else if (key) {
          output.push(key as PromptTaskID);
          iterator.next(iterate);
        } else {
          iterator.end((error) => (error ? reject(error) : resolve(output)));
        }
      }
      iterator.next(iterate);
    });
  }

  async markDanglingTaskIDs(taskIDs: Iterable<PromptTaskID>) {
    const batch = this.danglingTaskIDsIndexDB.batch();
    for (const promptTaskID of taskIDs) {
      batch.put(promptTaskID, "");
    }
    await batch.write();
  }

  async clearDanglingTaskIDs(taskIDs: Iterable<PromptTaskID>) {
    const batch = this.danglingTaskIDsIndexDB.batch();
    for (const promptTaskID of taskIDs) {
      batch.del(promptTaskID);
    }
    await batch.write();
  }

  async iterateAllActionLogsByTaskID(
    visitor: (
      taskID: string,
      logEntries: { log: ActionLog; id: ActionLogID }[],
    ) => Promise<unknown>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let currentTaskID: string | null = null;
      let currentTaskLogs: { log: ActionLog; id: ActionLogID }[] = [];

      const iterator = this.taskIDIndexDB.iterator({
        keys: true,
        values: true,
      });
      async function iterate(
        error: Error | undefined,
        key: string | undefined,
        value: string | undefined,
      ) {
        if (error) {
          reject(error);
        } else if (key && value) {
          const id = getActionLogIDFromTaskIDIndexDBKey(key);
          const actionLog = JSON.parse(value) as ActionLog;
          if (currentTaskID && actionLog.taskID !== currentTaskID) {
            await visitor(currentTaskID, currentTaskLogs).catch(reject);
            currentTaskLogs = [];
            currentTaskID = actionLog.taskID;
          } else if (currentTaskID === null) {
            currentTaskID = actionLog.taskID;
          }
          currentTaskLogs.push({ log: actionLog, id });
          iterator.next(iterate);
        } else {
          if (currentTaskID) {
            await visitor(currentTaskID, currentTaskLogs).catch(reject);
          }
          iterator.end((error) => (error ? reject(error) : resolve()));
        }
      }
      iterator.next(iterate);
    });
  }

  async clear(): Promise<void> {
    await this.rootDB.clear();
  }

  async close(): Promise<void> {
    await this.rootDB.close();
  }
}
