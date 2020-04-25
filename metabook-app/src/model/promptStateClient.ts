import isEqual from "lodash.isequal";

import { MetabookUserClient } from "metabook-client";
import {
  ActionLog,
  applyActionLogToPromptState,
  getActionLogFromPromptActionLog,
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

function updatePromptStateForLog(
  basePromptState: PromptState | null,
  promptActionLog: PromptActionLog<PromptTaskParameters>,
): PromptState | null {
  // TODO: implement real resolution
  if (
    promptActionLogCanBeAppliedToPromptState(promptActionLog, basePromptState)
  ) {
    const newPromptState = applyActionLogToPromptState({
      promptActionLog,
      basePromptState,
      schedule: "default",
    });
    if (newPromptState instanceof Error) {
      throw newPromptState;
    } else {
      return newPromptState;
    }
  } else {
    return null;
  }
}

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

  // TODO: Persist
  private brokenTaskIDs: Set<PromptTaskID>;

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

    this.brokenTaskIDs = new Set();
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
      .getLatestServerTimestamp()
      .then(async (latestServerLogTimestamp) => {
        let initialEntries: Map<PromptTaskID, PromptState>;
        if (latestServerLogTimestamp === null) {
          console.log(
            "No cached prompt states. Fetching initial prompt states.",
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
        } else {
          initialEntries = await this.promptStateStore.getDuePromptStates(
            dueThresholdMillis,
          );
          console.log(
            "[Performance] Got stored due prompt states",
            Date.now() / 1000.0,
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

        // this.ensureSubscriptionToRemoteLogs(latestServerLogTimestamp);
        importRemoteActionLogs(
          this.actionLogStore,
          this.promptStateStore,
          this.remoteClient,
        );
      });

    return () => {
      this.subscribers.delete(subscriber);
      if (this.subscribers.size === 0) {
        this.remoteLogSubscription?.();
        this.remoteLogSubscription = null;
      }
    };
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
        const newLatestServerTimestamp = await this.updateLocalStateForLogEntries(
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

  private async updateLocalStateForLogEntries(
    entries: Iterable<{
      log: ActionLog;
      serverTimestamp: ServerTimestamp | null;
    }>,
  ): Promise<ServerTimestamp | null> {
    // First, we get the current prompt states for these logs.
    const taskIDs = new Set<PromptTaskID>();
    for (const { log } of entries) {
      taskIDs.add(getPromptActionLogFromActionLog(log).taskID);
    }

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
    const affectedBrokenTaskIDs = new Map<PromptTaskID, PromptState | null>();
    const updates: {
      oldPromptState: PromptState | null;
      newPromptState: PromptState;
      taskID: PromptTaskID;
    }[] = [];
    for (const { log } of entries) {
      const promptActionLog = getPromptActionLogFromActionLog(log);
      const basePromptState =
        workingPromptStates.get(promptActionLog.taskID) ?? null;

      const newPromptState = updatePromptStateForLog(
        basePromptState,
        promptActionLog,
      );
      if (newPromptState) {
        console.log("Successfully applied log for ", promptActionLog.taskID);
        workingPromptStates.set(promptActionLog.taskID, newPromptState);
        updates.push({
          oldPromptState: basePromptState,
          newPromptState,
          taskID: promptActionLog.taskID,
        });
      } else {
        affectedBrokenTaskIDs.set(promptActionLog.taskID, basePromptState);
        this.brokenTaskIDs.add(promptActionLog.taskID);
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
        );
      }
    }

    const latestServerTimestamp = await this.actionLogStore.saveActionLogs(
      entries,
    );

    // Try to resolve any broken log sequences.
    await Promise.all(
      [...affectedBrokenTaskIDs.entries()].map(
        async ([taskID, basePromptState]) => {
          const logs = await this.actionLogStore.getActionLogsByTaskID(taskID);
          const mergeResult = mergeActionLogs(
            logs.map((log) => getPromptActionLogFromActionLog(log)),
            basePromptState,
          );
          if (mergeResult instanceof Error) {
            console.log(
              `Couldn't merge logs for ${taskID}. ${mergeResult.mergeLogErrorType}: ${mergeResult.message}`,
            );
          } else {
            console.log(`Resolved logs for ${taskID}`);
            this.brokenTaskIDs.delete(taskID);
            updates.push({
              oldPromptState: basePromptState,
              newPromptState: mergeResult,
              taskID,
            });
          }
        },
      ),
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

    console.log(
      `Broken task IDs (${this.brokenTaskIDs.size}): ${[
        ...this.brokenTaskIDs,
      ].join(", ")}`,
    );

    return latestServerTimestamp;
  }

  async recordPromptActionLogs(
    logs: Iterable<PromptActionLog<PromptTaskParameters>>,
  ): Promise<void> {
    const actionLogs = [...logs].map(getActionLogFromPromptActionLog);
    // TODO: if we're still doing our initial action log sync, queue these

    await Promise.all([
      this.remoteClient.recordActionLogs(actionLogs),
      this.updateLocalStateForLogEntries(
        actionLogs.map((log) => ({ log, serverTimestamp: null })),
      ),
    ]);
  }
}
