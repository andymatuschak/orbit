import isEqual from "lodash.isequal";

import { MetabookUserClient } from "metabook-client";
import {
  ActionLog,
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
  PromptTaskParameters,
} from "metabook-core";
import { ServerTimestamp } from "metabook-firebase-support";
import ActionLogStore from "./actionLogStore";
import importRemoteActionLogs from "./importRemoteActionLogs";
import PromptStateStore from "./promptStateStore";

export function computeSubscriberUpdate(
  subscriber: PromptStateClientSubscriber,
  changes: {
    taskID: PromptTaskID;
    oldPromptState: PromptState | null;
    newPromptState: PromptState;
  }[],
): PromptStateClientUpdate {
  function promptStateMatchesQuery(promptState: PromptState): boolean {
    return promptState.dueTimestampMillis <= subscriber.dueThresholdMillis;
  }

  const update: PromptStateClientUpdate = {
    addedEntries: new Map(),
    updatedEntries: new Map(),
    removedEntries: new Set(),
  };
  for (const { taskID, oldPromptState, newPromptState } of changes) {
    if (isEqual(oldPromptState, newPromptState)) {
      continue;
    }

    const didMatch = oldPromptState
      ? promptStateMatchesQuery(oldPromptState)
      : false;
    const nowMaches = promptStateMatchesQuery(newPromptState);
    if (didMatch && nowMaches) {
      update.updatedEntries.set(taskID, newPromptState);
    } else if (!didMatch && nowMaches) {
      update.addedEntries.set(taskID, newPromptState);
    } else if (didMatch && !nowMaches) {
      update.removedEntries.add(taskID);
    }
  }

  return update;
}

export interface PromptStateClientUpdate {
  addedEntries: Map<PromptTaskID, PromptState>;
  updatedEntries: Map<PromptTaskID, PromptState>;
  removedEntries: Set<PromptTaskID>;
}

interface PromptStateClientSubscriber {
  dueThresholdMillis: number;
  onUpdate: (update: PromptStateClientUpdate) => void;
}

export default class PromptStateClient {
  private remoteClient: MetabookUserClient;
  private promptStateStore: PromptStateStore;
  private actionLogStore: ActionLogStore;
  private readonly subscribers: Set<PromptStateClientSubscriber>;
  private remoteLogSubscription: (() => void) | null;

  constructor(
    remoteClient: MetabookUserClient,
    promptStateStore: PromptStateStore,
    actionLogStore: ActionLogStore,
  ) {
    this.remoteClient = remoteClient;
    this.promptStateStore = promptStateStore;
    this.actionLogStore = actionLogStore;
    this.subscribers = new Set();
    this.remoteLogSubscription = null;

    this.actionLogStore
      .hasCompletedInitialImport()
      .then(async (hasCompletedInitialImport) => {
        if (hasCompletedInitialImport) {
          this.ensureSubscriptionToRemoteLogs(
            await this.actionLogStore.getLatestServerTimestamp(),
          );
        } else {
          this.performInitialLogImport();
        }
      });
  }

  subscribeToDuePromptStates(
    dueThresholdMillis: number,
    onUpdate: (update: PromptStateClientUpdate) => void,
  ): () => void {
    const subscriber: PromptStateClientSubscriber = {
      dueThresholdMillis,
      onUpdate,
    };
    this.subscribers.add(subscriber);

    this.actionLogStore
      .hasCompletedInitialImport()
      .then(async (hasCompletedInitialImport) => {
        let initialEntries: Map<PromptTaskID, PromptState>;
        if (hasCompletedInitialImport) {
          initialEntries = await this.promptStateStore.getDuePromptStates(
            dueThresholdMillis,
          );
          console.log(
            "[Performance] Read stored due prompt states",
            Date.now() / 1000.0,
          );
        } else {
          console.log(
            "Hasn't finished initial import. Fetching initial prompt states.",
          );
          const initialPromptStateCaches = await this.remoteClient.getDuePromptStates(
            dueThresholdMillis,
          );
          await this.promptStateStore.savePromptStateCaches(
            initialPromptStateCaches.map((cache) => {
              const { taskID, ...promptState } = cache;
              return {
                taskID: taskID,
                promptState,
              };
            }),
          );
          initialEntries = new Map(
            initialPromptStateCaches.map((cache) => {
              const { taskID, ...promptState } = cache;
              return [taskID, promptState];
            }),
          );
        }

        // TODO: maybe wait to notify subscribers if the data is stale
        if (this.subscribers.has(subscriber)) {
          onUpdate({
            addedEntries: initialEntries,
            updatedEntries: new Map(),
            removedEntries: new Set(),
          });
        }
      });

    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  private async performInitialLogImport() {
    let currentServerTimestampThreshold: ServerTimestamp = (await this.actionLogStore.getLatestServerTimestamp()) ?? {
      seconds: 0,
      nanoseconds: 0,
    };
    console.log("[Action log import] Starting initial import");

    let total = 0;
    const savePromises: Promise<unknown>[] = [];
    const downloadStartTime = Date.now();
    while (true) {
      console.log(
        `[Action log import] Fetching logs after ${currentServerTimestampThreshold.seconds}.${currentServerTimestampThreshold.nanoseconds}.`,
      );

      const logs = await this.remoteClient.getActionLogs(
        currentServerTimestampThreshold,
        5000,
      );
      if (logs.length > 0) {
        total += logs.length;
        console.log(
          `[Action log import] Fetched ${logs.length} logs (total ${total}).`,
        );
        savePromises.push(this.actionLogStore.saveActionLogs(logs));
        currentServerTimestampThreshold = logs[logs.length - 1].serverTimestamp;
      } else {
        console.log(
          "[Action log import] Finished fetching action logs.",
          total,
          (Date.now() - downloadStartTime) / 1000,
        );
        break;
      }
    }
    await Promise.all(savePromises);
    console.log(
      "[Action log import] Finished writing action logs.",
      total,
      (Date.now() - downloadStartTime) / 1000,
    );

    let promptStateBatch: {
      taskID: PromptTaskID;
      promptState: PromptState;
    }[] = [];
    const startTime = Date.now();
    let promptStateCounter = 0;
    let errorCount = 0;
    await this.actionLogStore.iterateAllActionLogsByTaskID(
      async (taskID, entries) => {
        const mergedPromptState = mergeActionLogs(
          entries.map(({ log, id }) => ({
            log: getPromptActionLogFromActionLog(log),
            id,
          })),
          null,
        );
        if (mergedPromptState instanceof Error) {
          console.log(
            `Couldn't merge logs for ${taskID}. ${mergedPromptState.mergeLogErrorType}: ${mergedPromptState.message}.`,
          );
          errorCount++;
        } else {
          promptStateBatch.push({
            taskID: taskID as PromptTaskID,
            promptState: mergedPromptState,
          });
          if (promptStateBatch.length >= 100) {
            promptStateCounter += promptStateBatch.length;
            await this.promptStateStore.savePromptStateCaches(promptStateBatch);
            console.log(
              `[Action log import] Merged ${promptStateCounter} prompt states`,
            );
            promptStateBatch = [];
          }
        }
      },
    );
    if (promptStateBatch.length > 0) {
      promptStateCounter += promptStateBatch.length;
      console.log(
        `[Action log import] Merged ${promptStateCounter} prompt states`,
      );
      await this.promptStateStore.savePromptStateCaches(promptStateBatch);
    }

    console.log(
      "[Action log import] Finished merging action logs.",
      promptStateCounter,
      errorCount,
      (Date.now() - startTime) / 1000,
    );

    await this.actionLogStore.markInitialImportCompleted();
    this.ensureSubscriptionToRemoteLogs(currentServerTimestampThreshold);
  }

  private ensureSubscriptionToRemoteLogs(
    latestServerLogTimestamp: ServerTimestamp | null,
  ) {
    if (this.remoteLogSubscription) {
      return;
    }

    console.log("Subscribing to remote logs after", latestServerLogTimestamp);
    this.remoteLogSubscription = this.remoteClient.subscribeToActionLogs(
      latestServerLogTimestamp,
      async (newLogs) => {
        console.log(`Got new logs: ${newLogs.length}`);
        // TODO: debounce
        const newLatestServerTimestamp = await this.patchLocalStateFromLogEntries(
          newLogs,
        );
        this.remoteLogSubscription?.();
        this.remoteLogSubscription = null;
        this.ensureSubscriptionToRemoteLogs(newLatestServerTimestamp);
      },
      (error) => {
        console.error(`Error with log listener`, error); // TODO
      },
    );
  }

  private async patchLocalStateFromLogEntries(
    entries: Iterable<{
      log: ActionLog;
      id: ActionLogID;
      serverTimestamp: ServerTimestamp | null;
    }>,
  ): Promise<ServerTimestamp | null> {
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
    for (const { log, id } of entries) {
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

    const latestServerTimestamp = await this.actionLogStore.saveActionLogs(
      [...entries].map((e) => ({ ...e, id: getIDForActionLog(e.log) })),
    );

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

    return latestServerTimestamp;
  }

  async recordPromptActionLogs(
    entries: Iterable<{
      log: PromptActionLog<PromptTaskParameters>;
      id?: ActionLogID;
    }>,
  ): Promise<void> {
    const promptLogEntries = [...entries].map(({ log, id }) => {
      const actionLog = getActionLogFromPromptActionLog(log);
      return {
        log: actionLog,
        id: id ?? getIDForActionLog(actionLog),
        serverTimestamp: null,
      };
    });

    await Promise.all([
      this.remoteClient.recordActionLogs(
        promptLogEntries.map(({ log }) => log),
      ),
      this.patchLocalStateFromLogEntries(promptLogEntries),
    ]);
  }
}
