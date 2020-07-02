import { MetabookUserClient } from "metabook-client";
import { PromptStateCache, ServerTimestamp } from "metabook-firebase-support";
import { createTask, Task } from "../util/task";
import PromptStateStore from "./promptStateStore";

// If you cancel, the completion promise rejects with CancelledError
export default function promptStateInitialImportOperation(
  userClient: MetabookUserClient,
  promptStateStore: PromptStateStore,
): Task<ServerTimestamp | null> {
  return createTask(
    async (taskStatus): Promise<ServerTimestamp | null> => {
      let afterServerTimestamp: ServerTimestamp | null = null;
      let totalImported = 0;

      console.log("Prompt state import: starting");
      while (!taskStatus.isCancelled) {
        const promptStateCaches: PromptStateCache[] = await userClient.getPromptStates(
          {
            limit: 500,
            updatedAfterServerTimestamp: afterServerTimestamp ?? undefined,
          },
        );
        if (taskStatus.isCancelled) return null;
        if (promptStateCaches.length > 0) {
          totalImported += promptStateCaches.length;
          console.log(
            `Prompt state import: imported ${promptStateCaches.length} prompt states (${totalImported} total)`,
          );
          afterServerTimestamp =
            promptStateCaches[promptStateCaches.length - 1]
              .latestLogServerTimestamp;

          await promptStateStore.savePromptStates(
            promptStateCaches.map(
              ({ latestLogServerTimestamp, taskID, ...promptState }) => ({
                taskID,
                promptState,
              }),
            ),
          );
        } else {
          console.log("Prompt state import: finished");
          break;
        }
      }
      return afterServerTimestamp;
    },
  );
}
