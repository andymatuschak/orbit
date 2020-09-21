import { MetabookDataClient, MetabookUserClient } from "metabook-client";
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
import { maxServerTimestamp, ServerTimestamp } from "metabook-firebase-support";
import { ReviewItem } from "metabook-ui";
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

  private userClient: MetabookUserClient;
  private dataClient: MetabookDataClient;

  private dataRecordManager: DataRecordManager;

  private isClosed: boolean;
  private currentTask: Task<unknown> | null;
  private remoteLogSubscription: (() => void) | null;

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
      dataRecordClientFileStore,
    );
    this.isClosed = false;
    this.currentTask = null;
    this.remoteLogSubscription = null;

    this.cachedReviewItemQueuePromise = this.actionLogStore
      .getHasFinishedInitialImport()
      .then((hasFinishedInitialImport) =>
        fetchReviewItemQueue({
          dataRecordManager: this.dataRecordManager,
          userClient: this.userClient,
          promptStateStore: this.promptStateStore,
          dueBeforeTimestampMillis: Date.now(),
          hasFinishedInitialImport,
        }),
      );
    this.cachedReviewItemQueuePromise.then(() => this.initializeData());
  }

  private async initializeData() {
    if (this.isClosed) return;

    const hasFinishedInitialImport = await this.actionLogStore.getHasFinishedInitialImport();
    if (this.isClosed) return;
    if (hasFinishedInitialImport) {
      this.listenForNewLogsAfterTimestamp(
        await this.actionLogStore.getLatestServerTimestamp(),
      );
    } else {
      // Once we've downloaded a review queue, we try to download the user's full database.
      this.performInitialImport();
    }
  }

  async fetchReviewQueue(): Promise<ReviewItem[]> {
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
        serverTimestamp: null,
      })),
    );

    await Promise.all([
      this.userClient.recordActionLogs(
        promptLogEntries.map(({ log }) => getActionLogFromPromptActionLog(log)),
      ),
      this.patchLocalStateFromLogEntries(promptLogEntries),
    ]);
  }

  private async patchLocalStateFromLogEntries(
    entries: {
      log: PromptActionLog;
      id: ActionLogID;
      serverTimestamp: ServerTimestamp | null;
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

    this.remoteLogSubscription?.();

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

  private async listenForNewLogsAfterTimestamp(
    startingTimestamp: ServerTimestamp | null,
  ) {
    console.log(
      "[Action log subscription] Subscribing to remote logs after",
      startingTimestamp,
    );
    this.remoteLogSubscription = this.userClient.subscribeToActionLogs(
      {
        ...(startingTimestamp && { afterServerTimestamp: startingTimestamp }),
        limit: 100,
      },
      async (newLogs) => {
        console.log(`[Action log subscription] Got ${newLogs.length} new logs`);
        await this.patchLocalStateFromLogEntries(
          newLogs.map((entry) => ({
            ...entry,
            log: getPromptActionLogFromActionLog(entry.log),
          })),
        );
        this.remoteLogSubscription?.();
        this.remoteLogSubscription = null;

        const newStartingTimestamp = newLogs.reduce(
          (latestTimestamp, { serverTimestamp }) =>
            maxServerTimestamp(latestTimestamp, serverTimestamp),
          startingTimestamp,
        );
        this.listenForNewLogsAfterTimestamp(newStartingTimestamp);
      },
      (error) => {
        console.error(
          `[Action log subscription] Error with log listener`,
          error,
        ); // TODO
      },
    );
  }

  private async performInitialImport() {
    if (await this.actionLogStore.getHasFinishedInitialImport()) {
      return;
    }
    if (this.isClosed) return;

    const promptStateImportTask = promptStateInitialImportOperation(
      this.userClient,
      this.promptStateStore,
    );
    this.currentTask = promptStateImportTask;
    const latestPromptStateTimestamp = await promptStateImportTask.promise;
    this.currentTask = null;
    if (this.isClosed) return;

    this.listenForNewLogsAfterTimestamp(latestPromptStateTimestamp);

    if (latestPromptStateTimestamp !== null) {
      this.currentTask = promptDataInitialImportOperation(
        this.dataRecordManager,
        this.promptStateStore,
      );
      await this.currentTask.promise;
      this.currentTask = null;
      if (this.isClosed) return;

      this.currentTask = actionLogInitialImportOperation(
        this.userClient,
        this.actionLogStore,
        latestPromptStateTimestamp,
      );
      await this.currentTask.promise;
      this.currentTask = null;
      if (this.isClosed) return;
    } else {
      console.log(
        "Skipping action log import because there are no prompt states",
      );
    }

    await this.actionLogStore.setHasFinishedInitialImport();
    if (this.isClosed) return;

    this.resolveDanglingTaskIDs();
  }
}
