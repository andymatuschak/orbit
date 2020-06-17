import base64 from "base64-js";
import * as FileSystem from "expo-file-system";
import { MetabookDataClient, MetabookUserClient } from "metabook-client";
import {
  ActionLog,
  ActionLogID,
  applyActionLogToPromptState,
  getIDForActionLog,
  getPromptActionLogFromActionLog,
  mergeActionLogs,
  promptActionLogCanBeAppliedToPromptState,
  PromptState,
  PromptTaskID,
} from "metabook-core";
import { ServerTimestamp } from "metabook-firebase-support";
import { ReviewItem } from "metabook-ui";
import { Task } from "../util/task";
import actionLogInitialImportOperation from "./actionLogInitialImportOperation";
import ActionLogStore from "./actionLogStore";
import DataRecordManager, {
  DataRecordClientFileStore,
} from "./dataRecordManager";
import DataRecordStore from "./dataRecordStore";
import fetchReviewItemQueue from "./fetchReviewItemQueue";
import promptDataInitialImportOperation from "./promptDataInitialImportOperation";
import { computeSubscriberUpdate } from "./promptStateClient";
import promptStateInitialImportOperation from "./promptStateInitialImportOperation";
import PromptStateStore from "./promptStateStore";

async function cacheWriteHandler(name: string, data: Buffer): Promise<string> {
  const cacheDirectoryURI = FileSystem.cacheDirectory;
  if (cacheDirectoryURI === null) {
    throw new Error("Unknown cache directory");
  }
  const cachedAttachmentURI = cacheDirectoryURI + name;
  await FileSystem.writeAsStringAsync(
    cachedAttachmentURI,
    base64.fromByteArray(Uint8Array.from(data)),
    { encoding: "base64" },
  );
  console.log(`Wrote file to cache: ${cachedAttachmentURI}`);
  return cachedAttachmentURI;
}

async function fileExistsAtURL(url: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(url);
  return info.exists;
}

const fileStore: DataRecordClientFileStore = {
  writeFile: cacheWriteHandler,
  fileExistsAtURL,
};

export default class DatabaseManager {
  private actionLogStore: ActionLogStore;
  private dataRecordStore: DataRecordStore;
  private promptStateStore: PromptStateStore;

  private userClient: MetabookUserClient;
  private dataClient: MetabookDataClient;

  private dataRecordManager: DataRecordManager;

  private isClosed: boolean;
  private currentTask: Task<unknown> | null;

  private cachedReviewItemQueuePromise: Promise<ReviewItem[]>;

  constructor(userClient: MetabookUserClient, dataClient: MetabookDataClient) {
    this.userClient = userClient;
    this.dataClient = dataClient;
    this.actionLogStore = new ActionLogStore();
    this.dataRecordStore = new DataRecordStore();
    this.promptStateStore = new PromptStateStore();
    this.dataRecordManager = new DataRecordManager(
      dataClient,
      this.dataRecordStore,
      fileStore,
    );
    this.currentTask = null;
    this.isClosed = false;

    this.cachedReviewItemQueuePromise = fetchReviewItemQueue({
      dataRecordManager: this.dataRecordManager,
      userClient: this.userClient,
      promptStateStore: this.promptStateStore,
      dueBeforeTimestampMillis: Date.now(),
    });
    this.cachedReviewItemQueuePromise.finally(() => {
      if (this.isClosed) return;
      // Once we've downloaded a review queue, we try to download the user's full database.
      this.performInitialImport();
    });
  }

  async fetchReviewQueue(): Promise<ReviewItem[]> {
    // TODO: invalidate the queue after writing a log...
    return this.cachedReviewItemQueuePromise;
  }

  async recordPromptActionLogs(
    entries: Iterable<{
      log: ActionLog;
      id?: ActionLogID;
    }>,
  ): Promise<void> {
    const promptLogEntries = [...entries].map(({ log, id }) => {
      return {
        log,
        id: id ?? getIDForActionLog(log),
        serverTimestamp: null,
      };
    });

    await Promise.all([
      this.userClient.recordActionLogs(promptLogEntries.map(({ log }) => log)),
      this.patchLocalStateFromLogEntries(promptLogEntries),
    ]);
  }

  private async patchLocalStateFromLogEntries(
    entries: Iterable<{
      log: ActionLog;
      id: ActionLogID;
      serverTimestamp: ServerTimestamp | null;
    }>,
  ): Promise<void> {
    const taskIDs = new Set<PromptTaskID>();
    for (const { log } of entries) {
      taskIDs.add(getPromptActionLogFromActionLog(log).taskID);
    }

    // First, we get the current prompt states for these logs.
    const workingPromptStates = new Map<PromptTaskID, PromptState | null>();
    const promptStateGetPromises: Promise<unknown>[] = [];
    for (const taskID of taskIDs) {
      promptStateGetPromises.push(
        this.promptStateStore
          .getPromptState(taskID)
          .then((promptState) => workingPromptStates.set(taskID, promptState)),
      );
    }
    await Promise.all(promptStateGetPromises);

    // Now we try to directly apply all the new prompt states.
    const brokenTaskIDs = new Map<PromptTaskID, PromptState | null>();
    const updates: {
      oldPromptState: PromptState | null;
      newPromptState: PromptState;
      taskID: PromptTaskID;
    }[] = [];
    for (const { log, id, serverTimestamp } of entries) {
      const promptActionLog = getPromptActionLogFromActionLog(log);
      const basePromptState =
        workingPromptStates.get(promptActionLog.taskID) ?? null;

      if (basePromptState && basePromptState.headActionLogIDs.includes(id)) {
        // We've already patched in this log.
      } else if (
        promptActionLogCanBeAppliedToPromptState(
          promptActionLog,
          basePromptState,
        )
      ) {
        const newPromptState = applyActionLogToPromptState({
          promptActionLog,
          basePromptState,
          schedule: "default",
        });
        if (newPromptState instanceof Error) {
          throw newPromptState;
        } else {
          console.log("Successfully applied log for ", promptActionLog.taskID);
          workingPromptStates.set(promptActionLog.taskID, newPromptState);
          updates.push({
            oldPromptState: basePromptState,
            newPromptState,
            taskID: promptActionLog.taskID,
            latestLogServerTimestamp: serverTimestamp,
          });
        }
      } else {
        brokenTaskIDs.set(promptActionLog.taskID, basePromptState);
        console.log(
          `Can't apply log to prompt. New log heads: ${JSON.stringify(
            log,
            null,
            "\t",
          )}. Base prompt state: ${JSON.stringify(
            basePromptState,
            null,
            "\t",
          )}`,
          await this.actionLogStore.getActionLogsByTaskID(
            promptActionLog.taskID,
          ),
        );
      }
    }

    // Try to resolve any broken log sequences.
    await Promise.all(
      [...brokenTaskIDs.entries()].map(async ([taskID, basePromptState]) => {
        const entries = await this.actionLogStore.getActionLogsByTaskID(taskID);
        const mergeResult = mergeActionLogs(
          entries.map(({ log, id }) => ({
            log: getPromptActionLogFromActionLog(log),
            id,
          })),
          basePromptState,
        );
        if (mergeResult instanceof Error) {
          console.log(
            `Couldn't merge logs for ${taskID}. ${mergeResult.mergeLogErrorType}: ${mergeResult.message}`,
          );
        } else {
          console.log(`Resolved logs for ${taskID}`);
          updates.push({
            oldPromptState: basePromptState,
            newPromptState: mergeResult,
            taskID,
          });
        }
      }),
    );

    await this.promptStateStore.savePromptStateCaches(
      updates.map(({ newPromptState, taskID }) => ({
        promptState: newPromptState,
        taskID,
      })),
    );

    for (const subscriber of this.subscribers) {
      const update = computeSubscriberUpdate(subscriber, updates);
      if (
        update.addedEntries.size > 0 ||
        update.removedEntries.size > 0 ||
        update.updatedEntries.size > 0
      ) {
        subscriber.onUpdate(update);
      }
    }
  }

  async close(): Promise<void> {
    this.isClosed = true;

    // Finish writes before closing stores.
    this.currentTask?.cancel();
    await this.dataRecordManager.close();
    await Promise.all([
      this.actionLogStore.close(),
      this.dataRecordStore.close(),
      this.promptStateStore.close(),
    ]);
  }

  private async performInitialImport() {
    if (
      !(await this.promptStateStore.getHasFinishedInitialImport()) &&
      !this.isClosed
    ) {
      this.currentTask = promptStateInitialImportOperation(
        this.userClient,
        this.promptStateStore,
      );
      await this.currentTask.promise;
      this.currentTask = null;

      if (this.isClosed) return;
      await this.promptStateStore.setHasFinishedInitialImport();
    }

    if (
      !(await this.dataRecordStore.getHasFinishedInitialImport()) &&
      !this.isClosed
    ) {
      this.currentTask = promptDataInitialImportOperation(
        this.dataRecordManager,
        this.promptStateStore,
      );
      await this.currentTask.promise;
      this.currentTask = null;

      if (this.isClosed) return;
      await this.dataRecordStore.setHasFinishedInitialImport();
    }

    if (
      !(await this.actionLogStore.getHasFinishedInitialImport()) &&
      !this.isClosed
    ) {
      const latestPromptStateTimestamp = await this.promptStateStore.getLatestLogServerTimestamp();
      if (this.isClosed) return;
      if (latestPromptStateTimestamp === null) {
        console.log(
          "Skipping action log import because there are no prompt states",
        );
      } else {
        this.currentTask = actionLogInitialImportOperation(
          this.userClient,
          this.actionLogStore,
          latestPromptStateTimestamp,
        );
        await this.currentTask.promise;
        this.currentTask = null;
      }
      if (this.isClosed) return;
      await this.actionLogStore.setHasFinishedInitialImport();
    }
  }
}
