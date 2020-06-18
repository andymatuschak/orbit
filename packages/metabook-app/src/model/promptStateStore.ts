import { AbstractIteratorOptions } from "abstract-leveldown";
import LevelUp, * as levelup from "levelup";
import * as lexi from "lexicographic-integer";

import {
  getIDForPromptTask,
  getPromptTaskForID,
  PromptState,
  PromptTask,
  PromptTaskID,
} from "metabook-core";
import sub from "subleveldown";
import RNLeveldown from "../util/leveldown";
import { getJSONRecord, saveJSONRecord } from "./levelDBUtil";

function getDueTimestampIndexKey(
  promptState: PromptState,
  taskID: string & { __promptTaskIDOpaqueType: never },
) {
  return `${lexi.pack(promptState.dueTimestampMillis, "hex")}!${taskID}`;
}

const hasFinishedInitialImportKey = "hasFinishedInitialImport";

export default class PromptStateStore {
  private rootDB: levelup.LevelUp;
  private promptStateDB: levelup.LevelUp;
  private dueTimestampIndexDB: levelup.LevelUp;
  private opQueue: (() => Promise<unknown>)[];

  private isClosed: boolean;

  private cachedHasFinishedInitialImport: boolean | undefined;

  constructor(cacheName = "PromptStateStore") {
    this.rootDB = LevelUp(new RNLeveldown(cacheName));
    this.promptStateDB = sub(this.rootDB, "promptStates");
    this.dueTimestampIndexDB = sub(this.rootDB, "dueTimestampMillis");
    this.opQueue = [];

    this.isClosed = false;

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

  async savePromptStates(
    entries: Iterable<{
      promptState: PromptState;
      taskID: PromptTaskID;
    }>,
  ): Promise<void> {
    return this.runOp(async () => {
      const batch = this.promptStateDB.batch();
      const dueTimestampIndexBatch = this.dueTimestampIndexDB.batch();
      for (const { taskID, promptState } of entries) {
        const encodedPromptState = JSON.stringify(promptState);
        batch.put(taskID, encodedPromptState);

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

      await Promise.all([batch.write(), dueTimestampIndexBatch.write()]);
    });
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

  private async getPrompts(
    db: levelup.LevelUp,
    options: AbstractIteratorOptions,
    keyMapper: (key: string) => PromptTaskID,
    limit: number | undefined,
  ): Promise<Map<PromptTask, PromptState>> {
    return this.runOp(
      () =>
        new Promise((resolve, reject) => {
          const output: Map<PromptTask, PromptState> = new Map();
          const mergedOptions: AbstractIteratorOptions = {
            ...options,
            keys: true,
            values: true,
          };
          if (limit !== undefined) {
            mergedOptions.limit = limit;
          }
          const iterator = db.iterator(mergedOptions);

          function next(error: Error | undefined, key: string, value: string) {
            if (error) {
              reject(error);
            } else if (!key && !value) {
              iterator.end(() => {
                resolve(output);
              });
            } else {
              const taskID = keyMapper(key);
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

  async getAllPromptStates(
    afterPromptTask: PromptTask | null,
    limit?: number,
  ): Promise<Map<PromptTask, PromptState>> {
    const options: AbstractIteratorOptions = {};
    if (afterPromptTask) {
      options.gt = getIDForPromptTask(afterPromptTask);
    }
    return this.getPrompts(
      this.promptStateDB,
      options,
      (key) => key as PromptTaskID,
      limit,
    );
  }

  async getDuePromptStates(
    dueThresholdMillis: number,
    limit?: number,
  ): Promise<Map<PromptTask, PromptState>> {
    return this.getPrompts(
      this.dueTimestampIndexDB,
      {
        lt: `${lexi.pack(dueThresholdMillis, "hex")}~`, // i.e. the character after the due timestamp
      },
      (key) => key.split("!")[1] as PromptTaskID,
      limit,
    );
  }

  async clear(): Promise<void> {
    await this.runOp(async () => {
      this.cachedHasFinishedInitialImport = undefined;
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
