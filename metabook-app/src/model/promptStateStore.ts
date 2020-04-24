import LevelJS from "level-js";
import LevelUp, * as levelup from "levelup";
import { Transform } from "stream";
import * as lexi from "lexicographic-integer";

import { PromptState, PromptTaskID } from "metabook-core";
import { ServerTimestamp } from "metabook-firebase-support";
import sub from "subleveldown";
import { getJSONRecord } from "./levelDBUtil";

const latestLogServerTimestampDBKey = "_latestLogServerTimestamp";

function getDueTimestampIndexKey(
  promptState: PromptState,
  taskID: string & { __promptTaskIDOpaqueType: never },
) {
  return `${lexi.pack(promptState.dueTimestampMillis, "hex")}!${taskID}`;
}

export default class PromptStateStore {
  private rootDB: levelup.LevelUp;
  private promptStateDB: levelup.LevelUp;
  private dueTimestampIndexDB: levelup.LevelUp;
  private opQueue: (() => Promise<unknown>)[];

  private cachedLatestLogServerTimestamp: ServerTimestamp | null | undefined;

  constructor(cacheName = "PromptStateStore") {
    console.log("[Performance] Opening prompt store", Date.now() / 1000.0);
    this.rootDB = LevelUp(LevelJS(cacheName), () => {
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

  // Can only be called from the op queue
  private async _getLatestLogServerTimestamp(): Promise<ServerTimestamp | null> {
    if (this.cachedLatestLogServerTimestamp === undefined) {
      const result = await getJSONRecord(
        this.promptStateDB,
        latestLogServerTimestampDBKey,
      );
      this.cachedLatestLogServerTimestamp =
        (result?.record as ServerTimestamp) ?? null;
    }
    return this.cachedLatestLogServerTimestamp ?? null;
  }

  async getLatestLogServerTimestamp(): Promise<ServerTimestamp | null> {
    return this.runOp(async () => {
      return this._getLatestLogServerTimestamp();
    });
  }

  async savePromptStateCaches(
    entries: Iterable<{
      promptState: PromptState;
      taskID: PromptTaskID;
      lastLogServerTimestamp: ServerTimestamp | null;
    }>,
  ): Promise<ServerTimestamp | null> {
    return this.runOp(async () => {
      const initialLatestLogServerTimestamp = await this._getLatestLogServerTimestamp();
      let latestLogServerTimestamp = initialLatestLogServerTimestamp;

      const batch = this.promptStateDB.batch();
      const dueTimestampIndexBatch = this.dueTimestampIndexDB.batch();
      for (const { promptState, taskID, lastLogServerTimestamp } of entries) {
        const encodedPromptState = JSON.stringify(promptState);
        batch.put(taskID, encodedPromptState);

        dueTimestampIndexBatch.put(
          getDueTimestampIndexKey(promptState, taskID),
          encodedPromptState,
        );
        const oldPromptState = await this._getPromptState(taskID);
        if (oldPromptState) {
          dueTimestampIndexBatch.del(
            getDueTimestampIndexKey(oldPromptState, taskID),
          );
        }
        if (
          lastLogServerTimestamp &&
          (latestLogServerTimestamp === null ||
            lastLogServerTimestamp.seconds > latestLogServerTimestamp.seconds ||
            (lastLogServerTimestamp.seconds ===
              latestLogServerTimestamp.seconds &&
              lastLogServerTimestamp.nanoseconds >
                latestLogServerTimestamp.nanoseconds))
        ) {
          latestLogServerTimestamp = lastLogServerTimestamp;
        }
      }

      if (latestLogServerTimestamp !== initialLatestLogServerTimestamp) {
        batch.put(
          latestLogServerTimestampDBKey,
          JSON.stringify(latestLogServerTimestamp),
        );
        this.cachedLatestLogServerTimestamp = latestLogServerTimestamp;
      }

      await Promise.all([batch.write(), dueTimestampIndexBatch.write()]);
      return latestLogServerTimestamp;
    });
  }

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

          const indexUpdateTransformer = new Transform({
            objectMode: true,
            transform: async (chunk, inc, done) => {
              // console.log("[Performance] Start transform", Date.now());
              const indexKey = chunk.key;
              const promptState = JSON.parse(chunk.value);
              // If this is a stale index entry, ditch it.
              const taskID = indexKey.split("!")[1];
              // console.log("[Performance] Finish transform", Date.now());
              done(null, { taskID, promptState });
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
              // console.log("[Performance] Start data fn", Date.now());
              output.set(taskID, promptState);
              // console.log("[Performance] End data fn", Date.now());
            })
            .on("error", reject)
            .on("close", () => reject(new Error(`Database unexpected closed`)))
            .on("end", () => resolve(output));
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
