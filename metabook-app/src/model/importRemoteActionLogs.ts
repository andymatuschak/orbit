import { MetabookUserClient } from "metabook-client";
import {
  getPromptActionLogFromActionLog,
  mergeActionLogs,
  PromptState,
  PromptTaskID,
} from "metabook-core";
import { ServerTimestamp } from "metabook-firebase-support";
import ActionLogStore from "./actionLogStore";
import PromptStateStore from "./promptStateStore";

export default function importRemoteActionLogs(
  actionLogStore: ActionLogStore,
  promptStateStore: PromptStateStore,
  remoteClient: MetabookUserClient,
): { cancel: () => void; completion: Promise<void> } {
  let didCancel = false;

  const completionPromise = (async () => {
    console.log("[Action log import] Starting action log import.");

    // 1. Download all action logs into action log store.
    let currentServerTimestampThreshold: ServerTimestamp = {
      seconds: 0,
      nanoseconds: 0,
    };
    let total = 0;
    while (!didCancel) {
      console.log(
        `[Action log import] Fetching logs after ${currentServerTimestampThreshold.seconds}.${currentServerTimestampThreshold.nanoseconds}.`,
      );

      const logs = await remoteClient.getActionLogs(
        currentServerTimestampThreshold,
        10000,
      );
      if (logs.length > 0) {
        total += logs.length;
        console.log(
          `[Action log import] Fetched ${logs.length} logs (total ${total}).`,
        );
        actionLogStore.saveActionLogs(logs);
        currentServerTimestampThreshold = logs[logs.length - 1].serverTimestamp;
      } else {
        console.log("[Action log import] Done fetching action logs.");
        break;
      }
    }

    // 2. Iterate over action logs by task ID, merging and storing prompt states.
    let promptStateBatch: {
      taskID: PromptTaskID;
      promptState: PromptState;
    }[] = [];
    let promptStateCounter = 0;
    await actionLogStore.iterateAllActionLogsByTaskID(async (taskID, logs) => {
      if (didCancel) {
        return;
      }
      promptStateCounter++;

      const mergedPromptState = mergeActionLogs(
        logs.map(getPromptActionLogFromActionLog),
        null,
      );
      if (mergedPromptState instanceof Error) {
        console.log(
          `Couldn't merge logs for ${taskID}. ${mergedPromptState.mergeLogErrorType}: ${mergedPromptState.message}`,
        );
      } else {
        promptStateBatch.push({
          taskID: taskID as PromptTaskID,
          promptState: mergedPromptState,
        });
        if (promptStateBatch.length >= 1000) {
          console.log("[Action log import] Flushing", promptStateCounter);
          await promptStateStore.savePromptStateCaches(promptStateBatch);
          console.log("[Action log import] Flushed", promptStateCounter);
          promptStateBatch = [];
        }
      }
    });
    if (promptStateBatch.length > 0 && !didCancel) {
      console.log("[Action log import] Flushing", promptStateCounter);
      await promptStateStore.savePromptStateCaches(promptStateBatch);
    }
  })();

  return {
    cancel: () => {
      didCancel = true;
    },
    completion: completionPromise,
  };
}
