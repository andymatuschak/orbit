import OrbitAPIClient from "@withorbit/api-client";
import { ActionLogID } from "@withorbit/core";
import { createTask, Task } from "../util/task";
import ActionLogStore from "./actionLogStore";

export default function actionLogInitialImportOperation(
  apiClient: OrbitAPIClient,
  actionLogStore: ActionLogStore,
): Task<void> {
  return createTask(async (taskStatus) => {
    let afterLogID: ActionLogID | null = null;
    let logTotal = 0;

    const savePromises: Promise<unknown>[] = [];

    console.log("Action log import: starting");
    while (!taskStatus.isCancelled) {
      // Typescript can't infer the type when the await's on the same line. No idea why.
      const r = apiClient.listActionLogs({
        limit: 1000,
        createdAfterID: afterLogID ?? undefined,
      });
      const response = await r;
      if (taskStatus.isCancelled) return;

      const actionLogWrappers = response.data;
      // TODO: use hasMore
      if (actionLogWrappers.length > 0) {
        logTotal += actionLogWrappers.length;
        savePromises.push(
          actionLogStore.saveActionLogs(
            actionLogWrappers.map(({ data, id }) => ({ log: data, id })),
          ),
        );
        console.log(
          `Action log import: imported ${actionLogWrappers.length} action logs (${logTotal} total)`,
        );
        afterLogID = actionLogWrappers[actionLogWrappers.length - 1].id;
      } else {
        await Promise.all(savePromises);
        console.log("Action log import: finished");
        break;
      }
    }

    if (afterLogID) {
      await actionLogStore.setLatestCreatedSyncedLogID(afterLogID);
    }
  });
}
