import { AbstractIteratorOptions } from "abstract-leveldown";
import LevelUp, * as levelup from "levelup";
import * as lexi from "lexicographic-integer";

import {
  getPromptTaskForID,
  PromptState,
  PromptTask,
  PromptTaskID,
} from "metabook-core";
import {
  maxServerTimestamp,
  PromptStateCache,
  ServerTimestamp,
} from "metabook-firebase-support";
import sub from "subleveldown";
import RNLeveldown from "../util/leveldown";
import { getJSONRecord, saveJSONRecord } from "./levelDBUtil";

function getDueTimestampIndexKey(
  promptState: PromptState,
  taskID: string & { __promptTaskIDOpaqueType: never },
) {
  return `${lexi.pack(promptState.dueTimestampMillis, "hex")}!${taskID}`;
}

const latestLogServerTimestampKey = "latestLogServerTimestamp";
const hasFinishedInitialImportKey = "hasFinishedInitialImport";

export default class PromptStateStore {
  private rootDB: levelup.LevelUp;
  private promptStateDB: levelup.LevelUp;
  private dueTimestampIndexDB: levelup.LevelUp;
  private opQueue: (() => Promise<unknown>)[];

  private isClosed: boolean;

  private cachedLatestLogServerTimestamp: ServerTimestamp | null | undefined;
  private cachedHasFinishedInitialImport: boolean | undefined;

  constructor(cacheName = "PromptStateStore") {
    this.rootDB = LevelUp(new RNLeveldown(cacheName));
    this.promptStateDB = sub(this.rootDB, "promptStates");
    this.dueTimestampIndexDB = sub(this.rootDB, "dueTimestampMillis");
    this.opQueue = [];

    this.isClosed = false;

    this.cachedLatestLogServerTimestamp = undefined;
    this.cachedHasFinishedInitialImport = undefined;
  }

  private runOp<T>(op: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const runOp = () => {
        if (this.isClosed) {
          reject();
        }
        return op()
          .then(resolve, reject)
          .finally(() => {
            const nextOp = this.opQueue.shift();
            if (nextOp) {
              nextOp();
            }
          });
      };
      if (this.opQueue.length === 0) {
        runOp();
      } else {
        this.opQueue.push(runOp);
      }
    });
  }

  async getLatestLogServerTimestamp(): Promise<ServerTimestamp | null> {
    return this.runOp(async () => this._getLatestLogServerTimestamp());
  }

  async getHasFinishedInitialImport(): Promise<boolean> {
    return this.runOp(async () => {
      if (this.cachedHasFinishedInitialImport === undefined) {
        const result = await getJSONRecord<boolean>(
          this.rootDB,
          hasFinishedInitialImportKey,
        );
        this.cachedHasFinishedInitialImport = result?.record ?? false;
      }
      return this.cachedHasFinishedInitialImport;
    });
  }

  async setHasFinishedInitialImport(): Promise<void> {
    return this.runOp(async () => {
      await saveJSONRecord(this.rootDB, hasFinishedInitialImportKey, true);
      this.cachedHasFinishedInitialImport = true;
    });
  }

  async savePromptStateCaches(
    entries: Iterable<PromptStateCache>,
  ): Promise<void> {
    return this.runOp(async () => {
      const initialLatestLogServerTimestamp = await this._getLatestLogServerTimestamp();
      let maxLatestLogServerTimestamp = initialLatestLogServerTimestamp;

      const batch = this.promptStateDB.batch();
      const dueTimestampIndexBatch = this.dueTimestampIndexDB.batch();
      for (const {
        latestLogServerTimestamp,
        taskID,
        ...promptState
      } of entries) {
        const encodedPromptState = JSON.stringify(promptState);
        batch.put(taskID, encodedPromptState);

        maxLatestLogServerTimestamp = maxLatestLogServerTimestamp
          ? maxServerTimestamp(
              latestLogServerTimestamp,
              maxLatestLogServerTimestamp,
            )
          : latestLogServerTimestamp;

        // We'll remove our due timestamp index if we already had one.
        const oldPromptState = await this._getPromptState(taskID);
        if (oldPromptState) {
          dueTimestampIndexBatch.del(
            getDueTimestampIndexKey(oldPromptState, taskID),
          );
        }

        if (!promptState.taskMetadata.isDeleted) {
          const dueTimestampIndexKey = getDueTimestampIndexKey(
            promptState,
            taskID,
          );
          dueTimestampIndexBatch.put(dueTimestampIndexKey, encodedPromptState);
        }
      }

      const promises: Promise<unknown>[] = [
        batch.write(),
        dueTimestampIndexBatch.write(),
      ];
      if (maxLatestLogServerTimestamp !== initialLatestLogServerTimestamp) {
        promises.push(
          saveJSONRecord(
            this.rootDB,
            latestLogServerTimestampKey,
            maxLatestLogServerTimestamp,
          ),
        );
        this.cachedLatestLogServerTimestamp = maxLatestLogServerTimestamp;
      }
      await Promise.all(promises);
    });
  }

  // Can only be called from the op queue
  private async _getLatestLogServerTimestamp(): Promise<ServerTimestamp | null> {
    if (this.cachedLatestLogServerTimestamp === undefined) {
      const result = await getJSONRecord<ServerTimestamp>(
        this.rootDB,
        latestLogServerTimestampKey,
      );
      this.cachedLatestLogServerTimestamp = result?.record ?? null;
    }
    return this.cachedLatestLogServerTimestamp;
  }

  // Can only be called from the op queue
  private async _getPromptState(
    taskID: PromptTaskID,
  ): Promise<PromptState | null> {
    const recordString = await this.promptStateDB
      .get(taskID)
      .catch((error) => (error.notFound ? null : Promise.reject(error)));
    if (recordString) {
      return JSON.parse(recordString) as PromptState;
    } else {
      return null;
    }
  }

  async getPromptState(taskID: PromptTaskID): Promise<PromptState | null> {
    return this.runOp(async () => {
      return this._getPromptState(taskID);
    });
  }

  async getDuePromptStates(
    dueThresholdMillis: number,
    limit?: number,
  ): Promise<Map<PromptTask, PromptState>> {
    return this.runOp(
      () =>
        new Promise((resolve, reject) => {
          const output: Map<PromptTask, PromptState> = new Map();
          const options: AbstractIteratorOptions = {
            lt: `${lexi.pack(dueThresholdMillis, "hex")}~`, // i.e. the character after the due timestamp
            keys: true,
            values: true,
          };
          if (limit !== undefined) {
            options.limit = limit;
          }
          const iterator = this.dueTimestampIndexDB.iterator(options);

          function next(error: Error | undefined, key: string, value: string) {
            if (error) {
              reject(error);
            } else if (!key && !value) {
              iterator.end(() => {
                resolve(output);
              });
            } else {
              const taskID = key.split("!")[1] as PromptTaskID;
              const promptState = JSON.parse(value);
              const promptTask = getPromptTaskForID(taskID);
              if (promptTask instanceof Error) {
                console.error("Unparseable task ID", taskID, promptTask);
              } else {
                output.set(promptTask, promptState);
              }

              iterator.next(next);
            }
          }

          iterator.next(next);
        }),
    );
  }

  async clear(): Promise<void> {
    await this.runOp(async () => {
      await this.rootDB.clear();
    });
  }

  async close(): Promise<void> {
    await this.runOp(async () => {
      this.isClosed = true;
      await this.rootDB.close();
    });
  }
}
