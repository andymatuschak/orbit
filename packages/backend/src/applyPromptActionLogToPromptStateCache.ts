import {
  ActionLogID,
  applyActionLogToPromptState,
  getActionLogFromPromptActionLog,
  getIDForActionLog,
  getPromptActionLogFromActionLog,
  mergeActionLogs,
  promptActionLogCanBeAppliedToPromptState,
  PromptTaskID,
} from "@withorbit/core";
import {
  ActionLogDocument,
  maxServerTimestamp,
  PromptStateCache,
  ServerTimestamp,
} from "@withorbit/firebase-support";

export default async function applyActionLogDocumentToPromptStateCache({
  actionLogDocument,
  basePromptStateCache,
  fetchAllActionLogDocumentsForTask,
}: {
  actionLogDocument: ActionLogDocument;
  basePromptStateCache: PromptStateCache | null;
  fetchAllActionLogDocumentsForTask: () => Promise<
    { id: ActionLogID; log: ActionLogDocument<ServerTimestamp> }[]
  >;
}): Promise<PromptStateCache | Error> {
  const promptActionLog = getPromptActionLogFromActionLog(actionLogDocument);
  const creationServerTimestamp =
    basePromptStateCache?.creationServerTimestamp ??
    actionLogDocument.serverTimestamp;
  if (
    promptActionLogCanBeAppliedToPromptState(
      promptActionLog,
      basePromptStateCache,
    )
  ) {
    const newPromptState = applyActionLogToPromptState({
      basePromptState: basePromptStateCache,
      actionLogID: await getIDForActionLog(
        getActionLogFromPromptActionLog(promptActionLog),
      ),
      promptActionLog,
      schedule: "default",
    });
    if (newPromptState instanceof Error) {
      return newPromptState;
    } else {
      return {
        ...newPromptState,
        latestLogServerTimestamp: maxServerTimestamp(
          actionLogDocument.serverTimestamp,
          basePromptStateCache?.latestLogServerTimestamp ?? null,
        ),
        creationServerTimestamp,
        taskID: promptActionLog.taskID,
      };
    }
  } else {
    console.log("Log does not apply cleanly. Doing full merge.");
    const allActionLogDocuments = await fetchAllActionLogDocumentsForTask();
    const mergedPromptState = mergeActionLogs(
      allActionLogDocuments.map(({ id, log }) => ({
        id,
        log: getPromptActionLogFromActionLog(log),
      })),
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
        creationServerTimestamp,
      };
    }
  }
}
