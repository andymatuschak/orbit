import { MetabookUserClient } from "metabook-client";
import {
  ActionLogID,
  getIDForActionLog,
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
    /*    const downloadStartTime = Date.now();
    let currentServerTimestampThreshold: ServerTimestamp = {
      seconds: 0,
      nanoseconds: 0,
    };
    let total = 0;
    const savePromises: Promise<unknown>[] = [];
    while (!didCancel) {
      console.log(
        `[Action log import] Fetching logs after ${currentServerTimestampThreshold.seconds}.${currentServerTimestampThreshold.nanoseconds}.`,
      );

      const logs = await remoteClient.getActionLogs(
        currentServerTimestampThreshold,
        5000,
      );
      if (logs.length > 0) {
        total += logs.length;
        console.log(
          `[Action log import] Fetched ${logs.length} logs (total ${total}).`,
        );
        savePromises.push(actionLogStore.saveActionLogs(logs));
        currentServerTimestampThreshold = logs[logs.length - 1].serverTimestamp;
      } else {
        console.log("[Action log import] Done fetching action logs.");
        break;
      }
    }
    await Promise.all(savePromises);
    console.log(
      "Finished downloading.",
      total,
      (Date.now() - downloadStartTime) / 1000,
    );*/

    // 2. Iterate over action logs by task ID, merging and storing prompt states.
    let promptStateBatch: {
      taskID: PromptTaskID;
      promptState: PromptState;
    }[] = [];
    const startTime = Date.now();
    let promptStateCounter = 0;
    let errorCount = 0;
    await actionLogStore.iterateAllActionLogsByTaskID(
      async (taskID, entries) => {
        if (didCancel) {
          return;
        }
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
            console.log("[Action log import] Flushing", promptStateCounter);
            await promptStateStore.savePromptStateCaches(promptStateBatch);
            console.log("[Action log import] Flushed", promptStateCounter);
            promptStateBatch = [];
          }
        }
      },
    );
    if (promptStateBatch.length > 0 && !didCancel) {
      promptStateCounter += promptStateBatch.length;
      console.log("[Action log import] Final flush", promptStateCounter);
      await promptStateStore.savePromptStateCaches(promptStateBatch);
    }
    console.log(
      "Finished scanning action log store.",
      promptStateCounter,
      errorCount,
      (Date.now() - startTime) / 1000,
    );
  })();

  return {
    cancel: () => {
      didCancel = true;
    },
    completion: completionPromise,
  };
}
