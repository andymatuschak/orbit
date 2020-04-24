import isEqual from "lodash.isequal";

import { MetabookUserClient } from "metabook-client";
import {
  ActionLog,
  applyActionLogToPromptState,
  getActionLogFromPromptActionLog,
  getPromptActionLogFromActionLog,
  PromptActionLog,
  promptActionLogCanBeAppliedToPromptState,
  PromptState,
  PromptTaskID,
  PromptTaskParameters,
} from "metabook-core";
import { ServerTimestamp } from "metabook-firebase-support";
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
  private subscribers: Set<PromptStateClientSubscriber>;
  private remoteLogSubscription: (() => void) | null;

  constructor(
    remoteClient: MetabookUserClient,
    promptStateStore: PromptStateStore,
  ) {
    this.remoteClient = remoteClient;
    this.promptStateStore = promptStateStore;
    this.subscribers = new Set();
    this.remoteLogSubscription = null;
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

    this.promptStateStore
      .getLatestLogServerTimestamp()
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
              const { taskID, lastLogServerTimestamp, ...promptState } = cache;
              return {
                taskID: taskID,
                lastLogServerTimestamp,
                promptState,
              };
            }),
          );
          initialEntries = new Map(
            initialPromptStateCaches.map((cache) => {
              const { taskID, lastLogServerTimestamp, ...promptState } = cache;
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

        if (this.subscribers.has(subscriber)) {
          onUpdate({
            addedEntries: initialEntries,
            updatedEntries: new Map(),
            removedEntries: new Set(),
          });
        }

        this.ensureSubscriptionToRemoteLogs(latestServerLogTimestamp);
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

    // TODO: this timestamp should be the latest timestamp we've seen from the logs store, not the prompt state store
    this.remoteLogSubscription = this.remoteClient.subscribeToActionLogs(
      latestServerLogTimestamp,
      async (newLogs) => {
        this.updateLocalStateForLogEntries(newLogs);
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
  ): Promise<void> {
    // First, we get the current prompt states for these logs.
    const promptStateGetPromises: Promise<PromptState | null>[] = [];
    for (const { log } of entries) {
      promptStateGetPromises.push(
        this.promptStateStore.getPromptState(
          getPromptActionLogFromActionLog(log).taskID,
        ),
      );
    }
    const promptStates = await Promise.all(promptStateGetPromises);

    // Now we'll compute the new prompt states
    const updates: {
      oldPromptState: PromptState | null;
      newPromptState: PromptState;
      taskID: PromptTaskID;
      lastLogServerTimestamp: null;
    }[] = [];
    let logIndex = 0;
    for (const { log } of entries) {
      const basePromptState = promptStates[logIndex];
      logIndex++;

      if (!basePromptState) {
        console.warn(
          `Attempting to record log ${JSON.stringify(
            log,
            null,
            "\t",
          )} for which we have no prompt state`,
        );
        continue;
      }

      const promptActionLog = getPromptActionLogFromActionLog(log);
      const newPromptState = updatePromptStateForLog(
        basePromptState,
        promptActionLog,
      );
      if (!newPromptState) {
        throw new Error(
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

      updates.push({
        oldPromptState: basePromptState,
        newPromptState,
        taskID: promptActionLog.taskID,
        lastLogServerTimestamp: null,
      });
    }

    // TODO on write, update log listener for latest server timestamp
    // TODO cache logs

    const savePromise = this.promptStateStore.savePromptStateCaches(
      updates.map(({ newPromptState, taskID, lastLogServerTimestamp }) => ({
        promptState: newPromptState,
        taskID,
        lastLogServerTimestamp,
      })),
    );

    for (const subscriber of this.subscribers) {
      subscriber.onUpdate(computeSubscriberUpdate(subscriber, updates));
    }

    await savePromise;
  }

  async recordPromptActionLogs(
    logs: Iterable<PromptActionLog<PromptTaskParameters>>,
  ): Promise<void> {
    const actionLogs = [...logs].map(getActionLogFromPromptActionLog);
    // TODO: if we're still doing our initial action log sync, queue these

    await Promise.all([
      // TODO on write, update prompt state caches with latest server log timestamps
      this.remoteClient.recordActionLogs(actionLogs),
      this.updateLocalStateForLogEntries(
        actionLogs.map((log) => ({ log, serverTimestamp: null })),
      ),
    ]);
  }
}
