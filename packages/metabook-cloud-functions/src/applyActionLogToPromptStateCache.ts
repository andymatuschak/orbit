import {
  applyActionLogToPromptState,
  getPromptActionLogFromActionLog,
  promptActionLogCanBeAppliedToPromptState,
} from "metabook-core";
import {
  ActionLogDocument,
  compareServerTimestamps,
  PromptStateCache,
  ServerTimestamp,
} from "metabook-firebase-support";

export default function applyActionLogToPromptStateCache(
  actionLog: ActionLogDocument<firebase.firestore.Timestamp>,
  basePromptStateCache: PromptStateCache | null,
): PromptStateCache | Error {
  const promptActionLog = getPromptActionLogFromActionLog(actionLog);
  if (
    promptActionLogCanBeAppliedToPromptState(
      promptActionLog,
      basePromptStateCache,
    )
  ) {
    const newPromptState = applyActionLogToPromptState({
      basePromptState: basePromptStateCache,
      promptActionLog,
      schedule: "default",
    });
    if (newPromptState instanceof Error) {
      throw new Error(
        `Error applying log to prompt state: ${newPromptState}.\nLog: ${JSON.stringify(
          actionLog,
          null,
          "\t",
        )}\nBase prompt state: ${JSON.stringify(
          basePromptStateCache,
          null,
          "\t",
        )}`,
      );
    }

    let latestLogServerTimestamp: ServerTimestamp;
    if (basePromptStateCache) {
      latestLogServerTimestamp =
        compareServerTimestamps(
          actionLog.serverTimestamp,
          basePromptStateCache.latestLogServerTimestamp,
        ) < 0
          ? basePromptStateCache.latestLogServerTimestamp
          : actionLog.serverTimestamp;
    } else {
      latestLogServerTimestamp = actionLog.serverTimestamp;
    }
    return {
      ...newPromptState,
      latestLogServerTimestamp: latestLogServerTimestamp,
      taskID: promptActionLog.taskID,
    };
  } else {
    return new Error(
      `Cannot apply log to prompt state. Log: ${JSON.stringify(
        actionLog,
        null,
        "\t",
      )}\nBase prompt state: ${JSON.stringify(
        basePromptStateCache,
        null,
        "\t",
      )}`,
    );
  }
}
