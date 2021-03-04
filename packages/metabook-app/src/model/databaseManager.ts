import OrbitAPIClient from "@withorbit/api-client";
import {
  ActionLogID,
  applyActionLogToPromptState,
  getActionLogFromPromptActionLog,
  getIDForActionLog,
  getPromptActionLogFromActionLog,
  mergeActionLogs,
  PromptActionLog,
  promptActionLogCanBeAppliedToPromptState,
  PromptState,
  PromptTaskID,
} from "metabook-core";
import { Platform } from "react-native";

import { Task } from "../util/task";
import actionLogInitialImportOperation from "./actionLogInitialImportOperation";
import ActionLogStore from "./actionLogStore";
import dataRecordClientFileStore from "./dataRecordClientFileStore";
import DataRecordManager from "./dataRecordManager";
import DataRecordStore from "./dataRecordStore";
import fetchReviewItemQueue from "./fetchReviewItemQueue";
import promptDataInitialImportOperation from "./promptDataInitialImportOperation";
import promptStateInitialImportOperation from "./promptStateInitialImportOperation";
import PromptStateStore from "./promptStateStore";

export default class DatabaseManager {
  private actionLogStore: ActionLogStore;
  private dataRecordStore: DataRecordStore;
  private promptStateStore: PromptStateStore;

  private apiClient: OrbitAPIClient;

  private dataRecordManager: DataRecordManager;

  private isClosed: boolean;
  private currentTask: Task<unknown> | null;

  private cachedReviewItemQueuePromise: ReturnType<typeof fetchReviewItemQueue>;

  constructor(apiClient: OrbitAPIClient) {
    this.apiClient = apiClient;
    this.actionLogStore = new ActionLogStore();
    this.dataRecordStore = new DataRecordStore();
    this.promptStateStore = new PromptStateStore();
    this.dataRecordManager = new DataRecordManager(
      apiClient,
      this.dataRecordStore,
      dataRecordClientFileStore,
    );
    this.isClosed = false;
    this.currentTask = null;

    this.cachedReviewItemQueuePromise = this.actionLogStore
      .getHasFinishedInitialImport()
      .then((hasFinishedInitialImport) =>
        fetchReviewItemQueue({
          dataRecordManager: this.dataRecordManager,
          apiClient: this.apiClient,
          promptStateStore: this.promptStateStore,
          nowTimestampMillis: Date.now(),
          hasFinishedInitialImport,
        }),
      );
    this.cachedReviewItemQueuePromise.then(() => this.initializeData());
  }

  private async initializeData() {
    // HACK: disable local storage on web until I think through resilience more carefully.
    if (Platform.OS === "web") return;

    if (this.isClosed) return;

    const hasFinishedInitialImport = await this.actionLogStore.getHasFinishedInitialImport();
    if (this.isClosed) return;
    if (hasFinishedInitialImport) {
      this.fetchNewLogs(
        await this.actionLogStore.getLatestCreatedSyncedLogID(),
      );
    } else {
      // Once we've downloaded a review queue, we try to download the user's full database.
      this.performInitialImport();
    }
  }

  async fetchReviewQueue(): ReturnType<typeof fetchReviewItemQueue> {
    // TODO: invalidate the queue after writing a log...
    return this.cachedReviewItemQueuePromise;
  }

  async recordPromptActionLogs(
    entries: Iterable<PromptActionLog>,
  ): Promise<void> {
    const promptLogEntries = await Promise.all(
      [...entries].map(async (log) => ({
        log,
        id: await getIDForActionLog(log),
      })),
    );

    await Promise.all([
      this.apiClient.storeActionLogs(
        promptLogEntries.map(({ log, id }) => ({
          id,
          data: getActionLogFromPromptActionLog(log),
        })),
      ),
      this.patchLocalStateFromLogEntries(promptLogEntries),
    ]);
  }

  private async patchLocalStateFromLogEntries(
    entries: {
      log: PromptActionLog;
      id: ActionLogID;
    }[],
  ): Promise<void> {
    const taskIDs = new Set<PromptTaskID>(
      entries.map(({ log: { taskID } }) => taskID),
    );

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
    const brokenTaskIDs = new Set<PromptTaskID>();
    const updates: {
      oldPromptState: PromptState | null;
      newPromptState: PromptState;
      taskID: PromptTaskID;
    }[] = [];
    for (const { log, id } of entries) {
      const basePromptState = workingPromptStates.get(log.taskID) ?? null;

      if (basePromptState && basePromptState.headActionLogIDs.includes(id)) {
        // We've already patched in this log.
      } else if (
        promptActionLogCanBeAppliedToPromptState(log, basePromptState)
      ) {
        const newPromptState = applyActionLogToPromptState({
          promptActionLog: log,
          actionLogID: id,
          basePromptState,
          schedule: "default",
        });
        if (newPromptState instanceof Error) {
          throw newPromptState; // shouldn't happen
        } else {
          console.log("Successfully applied log for ", log.taskID);
          workingPromptStates.set(log.taskID, newPromptState);
          updates.push({
            oldPromptState: basePromptState,
            newPromptState,
            taskID: log.taskID,
          });
        }
      } else {
        brokenTaskIDs.add(log.taskID);
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
          await this.actionLogStore.getActionLogsByTaskID(log.taskID),
        );
      }
    }

    await this.actionLogStore.saveActionLogs(entries);

    await this.promptStateStore.savePromptStates(
      updates.map(({ newPromptState, taskID }) => ({
        promptState: newPromptState,
        taskID,
      })),
    );

    if (brokenTaskIDs.size > 0) {
      this.actionLogStore.markDanglingTaskIDs(brokenTaskIDs);
    }
    this.resolveDanglingTaskIDs();
  }

  async close(): Promise<void> {
    this.isClosed = true;

    this.currentTask?.cancel();
    await Promise.all([
      this.actionLogStore.close(),
      this.dataRecordStore.close(),
      this.promptStateStore.close(),
    ]);
  }

  private async resolveDanglingTaskIDs() {
    const danglingTaskIDs = await this.actionLogStore.getDanglingTaskIDs();
    if (danglingTaskIDs.length === 0) return;
    console.log(`[Resolve dangling task IDs]: ${danglingTaskIDs}`);

    const resolvedEntries: {
      taskID: PromptTaskID;
      promptState: PromptState;
    }[] = [];
    await Promise.all(
      danglingTaskIDs.map(async (taskID) => {
        const entries = await this.actionLogStore.getActionLogsByTaskID(taskID);
        const promptState = mergeActionLogs(
          entries.map(({ log, id }) => ({
            log: getPromptActionLogFromActionLog(log),
            id,
          })),
        );
        if (promptState instanceof Error) {
          console.log(
            `Couldn't merge logs for ${taskID}. ${promptState.mergeLogErrorType}: ${promptState.message}`,
          );
        } else {
          resolvedEntries.push({ taskID, promptState });
        }
      }),
    );

    if (resolvedEntries.length > 0) {
      const resolvedTaskIDs = resolvedEntries.map(({ taskID }) => taskID);
      console.log(`[Resolve dangling task IDs]: Resolved ${resolvedTaskIDs}`);
      await Promise.all([
        this.actionLogStore.clearDanglingTaskIDs(resolvedTaskIDs),
        this.promptStateStore.savePromptStates(resolvedEntries),
      ]);
    }
  }

  private async fetchNewLogs(afterLogID: ActionLogID | null) {
    console.log("[Database manager] Fetching logs after", afterLogID);
    const createdAfterID = afterLogID ?? undefined;
    const result = await this.apiClient.listActionLogs({
      createdAfterID,
      limit: 500,
    });
    console.log(`[Database manager] Got ${result.data.length} new logs`);

    await this.patchLocalStateFromLogEntries(
      result.data.map(({ data, id }) => ({
        id,
        log: getPromptActionLogFromActionLog(data),
      })),
    );

    const newAfterLogID = result.data[result.data.length - 1].id;
    this.actionLogStore.setLatestCreatedSyncedLogID(newAfterLogID);

    if (result.hasMore) {
      this.fetchNewLogs(newAfterLogID);
    }
  }

  private async performInitialImport() {
    if (await this.actionLogStore.getHasFinishedInitialImport()) {
      return;
    }
    if (this.isClosed) return;

    const promptStateImportTask = promptStateInitialImportOperation(
      this.apiClient,
      this.promptStateStore,
    );
    this.currentTask = promptStateImportTask;
    await promptStateImportTask.promise;
    this.currentTask = null;
    if (this.isClosed) return;

    this.currentTask = promptDataInitialImportOperation(
      this.dataRecordManager,
      this.promptStateStore,
    );
    await this.currentTask.promise;
    this.currentTask = null;
    if (this.isClosed) return;

    this.currentTask = actionLogInitialImportOperation(
      this.apiClient,
      this.actionLogStore,
    );
    await this.currentTask.promise;
    this.currentTask = null;
    if (this.isClosed) return;

    await this.actionLogStore.setHasFinishedInitialImport();
    if (this.isClosed) return;

    this.resolveDanglingTaskIDs();
  }
}
