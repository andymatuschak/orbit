import OrbitAPIClient from "@withorbit/api-client";
import { PromptTaskID } from "@withorbit/core";
import { createTask, Task } from "../util/task";
import PromptStateStore from "./promptStateStore";

// If you cancel, the completion promise rejects with CancelledError
export default function promptStateInitialImportOperation(
  apiClient: OrbitAPIClient,
  promptStateStore: PromptStateStore,
  // Returns the ID of the latest task created
): Task<PromptTaskID | null> {
  return createTask(async (taskStatus) => {
    let afterTaskID: PromptTaskID | null = null;
    let totalImported = 0;

    console.log("Prompt state import: starting");
    while (!taskStatus.isCancelled) {
      // Typescript can't infer the type when the await's on the same line. No idea why.
      const r = apiClient.listTaskStates({
        limit: 500,
        createdAfterID: afterTaskID ?? undefined,
      });
      const response = await r;

      const promptStates = response.data;
      if (taskStatus.isCancelled) return null;
      // TODO: use hasMore
      if (promptStates.length > 0) {
        totalImported += promptStates.length;
        console.log(
          `Prompt state import: imported ${promptStates.length} prompt states (${totalImported} total)`,
        );
        afterTaskID = promptStates[promptStates.length - 1].id;

        await promptStateStore.savePromptStates(
          promptStates.map(({ data, id }) => ({
            taskID: id,
            promptState: data,
          })),
        );
      } else {
        console.log("Prompt state import: finished");
        break;
      }
    }
    return afterTaskID;
  });
}
