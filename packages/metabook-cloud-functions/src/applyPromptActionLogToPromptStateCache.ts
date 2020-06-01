import {
  ActionLogID,
  applyActionLogToPromptState,
  getPromptActionLogFromActionLog,
  mergeActionLogs,
  promptActionLogCanBeAppliedToPromptState,
  PromptTaskID,
} from "metabook-core";
import {
  ActionLogDocument,
  maxServerTimestamp,
  PromptStateCache,
  ServerTimestamp,
} from "metabook-firebase-support";

// TODO: ensure that the log is actually a prompt log
export default async function applyActionLogDocumentToPromptStateCache({
  actionLogDocument,
  basePromptStateCache,
  fetchAllActionLogDocumentsForTask,
}: {
  actionLogDocument: ActionLogDocument<ServerTimestamp>;
  basePromptStateCache: PromptStateCache | null;
  fetchAllActionLogDocumentsForTask: () => Promise<
    { id: ActionLogID; log: ActionLogDocument<ServerTimestamp> }[]
  >;
}): Promise<PromptStateCache | Error> {
  const promptActionLog = getPromptActionLogFromActionLog(actionLogDocument);
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
      return newPromptState;
    } else {
      let latestLogServerTimestamp: ServerTimestamp;
      if (basePromptStateCache) {
        latestLogServerTimestamp = maxServerTimestamp(
          actionLogDocument.serverTimestamp,
          basePromptStateCache.latestLogServerTimestamp,
        );
      } else {
        latestLogServerTimestamp = actionLogDocument.serverTimestamp;
      }
      return {
        ...newPromptState,
        latestLogServerTimestamp: latestLogServerTimestamp,
        taskID: promptActionLog.taskID,
      };
    }
  } else {
    const allActionLogDocuments = await fetchAllActionLogDocumentsForTask();
    const mergedPromptState = mergeActionLogs(
      allActionLogDocuments.map(({ id, log }) => ({
        id,
        log: getPromptActionLogFromActionLog(log),
      })),
      basePromptStateCache,
    );
    if (mergedPromptState instanceof Error) {
      return mergedPromptState;
    } else {
      const latestLogServerTimestamp = allActionLogDocuments.reduce(
        (max, { log }) => {
          const timestamp = log.serverTimestamp;
          return maxServerTimestamp(timestamp, max);
        },
        { seconds: 0, nanoseconds: 0 },
      );
      return {
        ...mergedPromptState,
        taskID: actionLogDocument.taskID as PromptTaskID,
        latestLogServerTimestamp,
      };
    }
  }
}
