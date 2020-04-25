import LevelJS from "level-js";
import LevelUp, * as levelup from "levelup";
import * as lexi from "lexicographic-integer";

import {
  ActionLog,
  ActionLogID,
  getIDForActionLog,
  PromptTaskID,
} from "metabook-core";
import { ServerTimestamp } from "metabook-firebase-support";
import { Transform } from "stream";
import sub from "subleveldown";
import { getJSONRecord } from "./levelDBUtil";

const latestLogServerTimestampDBKey = "_latestLogServerTimestamp";

export default class ActionLogStore {
  private rootDB: levelup.LevelUp;
  private actionLogDB: levelup.LevelUp;
  private taskIDIndexDB: levelup.LevelUp;
  private cachedLatestServerTimestamp: ServerTimestamp | null | undefined;

  constructor(storeName = "ActionLogStore") {
    this.rootDB = LevelUp(LevelJS(storeName));
    this.actionLogDB = sub(this.rootDB, "logs");
    this.taskIDIndexDB = sub(this.rootDB, "taskIDIndex");
  }

  async getLatestServerTimestamp(): Promise<ServerTimestamp | null> {
    if (this.cachedLatestServerTimestamp === undefined) {
      const result = await getJSONRecord(
        this.actionLogDB,
        latestLogServerTimestampDBKey,
      );
      this.cachedLatestServerTimestamp =
        (result?.record as ServerTimestamp) ?? null;
    }
    return this.cachedLatestServerTimestamp ?? null;
  }

  async saveActionLogs(
    entries: Iterable<{
      log: ActionLog;
      serverTimestamp: ServerTimestamp | null;
    }>,
  ): Promise<ServerTimestamp | null> {
    const initialLatestServerTimestamp = await this.getLatestServerTimestamp();
    let latestServerTimestamp = initialLatestServerTimestamp;

    const batch = this.actionLogDB.batch();
    const taskIDIndexBatch = this.taskIDIndexDB.batch();
    for (const { log, serverTimestamp } of entries) {
      const encodedLog = JSON.stringify(log);
      const id = getIDForActionLog(log);
      batch.put(id, encodedLog);

      taskIDIndexBatch.put(
        `${log.taskID}!${lexi.pack(log.timestampMillis, "hex")}!${id}`,
        encodedLog,
      );

      if (
        serverTimestamp &&
        (latestServerTimestamp === null ||
          serverTimestamp.seconds > latestServerTimestamp.seconds ||
          (serverTimestamp.seconds === latestServerTimestamp.seconds &&
            serverTimestamp.nanoseconds > latestServerTimestamp.nanoseconds))
      ) {
        latestServerTimestamp = serverTimestamp;
      }
    }

    if (latestServerTimestamp !== initialLatestServerTimestamp) {
      batch.put(
        latestLogServerTimestampDBKey,
        JSON.stringify(latestServerTimestamp),
      );
      this.cachedLatestServerTimestamp = latestServerTimestamp;
    }

    await Promise.all([batch.write(), await taskIDIndexBatch.write()]);
    return latestServerTimestamp;
  }

  async getActionLog(id: ActionLogID): Promise<ActionLog | null> {
    const result = await getJSONRecord(this.actionLogDB, id);
    return (result?.record as ActionLog) ?? null;
  }

  async getActionLogsByTaskID(
    taskID: string,
    limit?: number,
  ): Promise<ActionLog[]> {
    return new Promise((resolve, reject) => {
      const output: ActionLog[] = [];

      const fetchTransformer = new Transform({
        objectMode: true,
        transform: async (chunk, inc, done) => {
          const log = JSON.parse(chunk.value) as ActionLog;
          if (!log) {
            throw new Error(
              `Action log byTaskID index has ID ${chunk.value} which does not exist`,
            );
          }
          done(null, log);
        },
      });

      this.taskIDIndexDB
        .createReadStream({
          gte: taskID,
          lt: taskID + "~", // ~ is sorted after all ASCII characters
          values: true,
          limit,
        })
        .pipe(fetchTransformer)
        .on("data", (log) => output.push(log))
        .on("error", reject)
        .on("close", () => reject(new Error(`Database unexpected closed`)))
        .on("end", () => resolve(output));
    });
  }

  async iterateAllActionLogsByTaskID(
    visitor: (taskID: string, logs: ActionLog[]) => Promise<unknown>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let currentTaskID: string | null = null;
      let currentTaskLogs: ActionLog[] = [];
      const fetchTransformer = new Transform({
        objectMode: true,
        transform: async (chunk, inc, done) => {
          const actionLog = JSON.parse(chunk.value) as ActionLog;

          if (currentTaskID && actionLog.taskID !== currentTaskID) {
            await visitor(currentTaskID, currentTaskLogs);
            currentTaskLogs = [];
            currentTaskID = actionLog.taskID;
          } else if (currentTaskID === null) {
            currentTaskID = actionLog.taskID;
          }
          currentTaskLogs.push(actionLog);

          if (!actionLog) {
            throw new Error(
              `Action log byTaskID index has ID ${chunk.value} which does not exist`,
            );
          }
          done(null, actionLog);
        },
      });

      this.taskIDIndexDB
        .createReadStream({
          values: true,
        })
        .pipe(fetchTransformer)
        .on("data", () => {
          return;
        })
        .on("error", reject)
        .on("close", () => reject(new Error(`Database unexpected closed`)))
        .on("end", async () => {
          if (currentTaskID) {
            await visitor(currentTaskID, currentTaskLogs);
          }
          resolve();
        });
    });
  }

  async clear(): Promise<void> {
    await this.rootDB.clear();
  }

  async close(): Promise<void> {
    await this.rootDB.close();
  }
}
