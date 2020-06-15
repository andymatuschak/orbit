import RNLeveldown from "../util/leveldown";
import LevelUp, * as levelup from "levelup";
import * as lexi from "lexicographic-integer";

import { PromptState, PromptTaskID } from "metabook-core";
import {
  maxServerTimestamp,
  PromptStateCache,
  ServerTimestamp,
} from "metabook-firebase-support";
import { Transform } from "stream";
import sub from "subleveldown";
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

  private cachedLatestLogServerTimestamp: ServerTimestamp | null | undefined;

  constructor(cacheName = "PromptStateStore") {
    console.log("[Performance] Opening prompt store", Date.now() / 1000.0);
    this.rootDB = LevelUp(new RNLeveldown(cacheName), () => {
      console.log("[Performance] Opened database", Date.now() / 1000.0);
    });
    this.promptStateDB = sub(this.rootDB, "promptStates");
    this.dueTimestampIndexDB = sub(this.rootDB, "dueTimestampMillis");
    this.cachedLatestLogServerTimestamp = undefined;
    this.opQueue = [];
  }

  private runOp<T>(op: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const runOp = () => {
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
      const result = await getJSONRecord<boolean>(
        this.rootDB,
        hasFinishedInitialImportKey,
      );
      return result?.record ?? false;
    });
  }

  async setHasFinishedInitialImport(): Promise<void> {
    return this.runOp(async () => {
      await saveJSONRecord(this.rootDB, hasFinishedInitialImportKey, true);
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

        const dueTimestampIndexKey = getDueTimestampIndexKey(
          promptState,
          taskID,
        );
        if (promptState.taskMetadata.isDeleted) {
          dueTimestampIndexBatch.del(dueTimestampIndexKey);
        } else {
          dueTimestampIndexBatch.put(dueTimestampIndexKey, taskID);
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
  ): Promise<Map<PromptTaskID, PromptState>> {
    return this.runOp(
      () =>
        new Promise((resolve, reject) => {
          const output: Map<PromptTaskID, PromptState> = new Map();

          const promises: Promise<unknown>[] = [];

          const indexUpdateTransformer = new Transform({
            objectMode: true,
            transform: async (chunk, inc, done) => {
              const indexKey = chunk.key;
              const dueTimestamp = lexi.unpack(indexKey.split("!")[0]);
              const taskID = indexKey.split("!")[1];
              const promptState = await this._getPromptState(taskID);
              if (promptState) {
                if (promptState.dueTimestampMillis === dueTimestamp) {
                  done(null, { taskID, promptState });
                } else {
                  // Stale index. Remove the key.
                  promises.push(this.dueTimestampIndexDB.del(indexKey));
                  done(null);
                }
              } else {
                throw new Error(
                  `Inconsistent index: contains index for prompt state with key ${taskID}, which doesn't exist`,
                );
              }
            },
          });

          this.dueTimestampIndexDB
            .createReadStream({
              lt: `${lexi.pack(dueThresholdMillis, "hex")}~`, // i.e. the character after the due timestamp
              keys: true,
              values: true,
              limit,
            })
            .pipe(indexUpdateTransformer)
            .on("data", ({ taskID, promptState }) => {
              output.set(taskID, promptState);
            })
            .on("error", async (error) => {
              await Promise.all(promises);
              reject(error);
            })
            .on("close", async () => {
              await Promise.all(promises);
              reject(new Error(`Database unexpected closed`));
            })
            .on("end", async () => {
              await Promise.all(promises);
              resolve(output);
            });
        }),
    );
  }

  async clear(): Promise<void> {
    await this.rootDB.clear();
  }

  async close(): Promise<void> {
    await this.rootDB.close();
  }
}
