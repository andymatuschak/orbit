import { MetabookUserClient } from "metabook-client";
import { ActionLog, ActionLogID } from "metabook-core";
import { ServerTimestamp } from "metabook-firebase-support";
import { createTask, Task } from "../util/task";
import ActionLogStore from "./actionLogStore";

export default function actionLogInitialImportOperation(
  userClient: MetabookUserClient,
  actionLogStore: ActionLogStore,
  onOrBeforeServerTimestamp: ServerTimestamp,
): Task<void> {
  return createTask(async (taskStatus) => {
    let latestServerTimestamp: ServerTimestamp | null = null;
    let logTotal = 0;

    const savePromises: Promise<unknown>[] = [];

    console.log("Action log import: starting");
    while (!taskStatus.isCancelled) {
      const actionLogs: {
        log: ActionLog;
        id: ActionLogID;
        serverTimestamp: ServerTimestamp;
      }[] = await userClient.getActionLogs({
        onOrBeforeServerTimestamp,
        limit: 1000,
        afterServerTimestamp: latestServerTimestamp ?? undefined,
      });
      if (taskStatus.isCancelled) return;

      if (actionLogs.length > 0) {
        logTotal += actionLogs.length;
        savePromises.push(actionLogStore.saveActionLogs(actionLogs));
        console.log(
          `Action log import: imported ${actionLogs.length} action logs (${logTotal} total)`,
        );
        latestServerTimestamp =
          actionLogs[actionLogs.length - 1].serverTimestamp;
      } else {
        await Promise.all(savePromises);
        console.log("Action log import: finished");
        break;
      }
    }
  });
}
