import { MetabookUserClient } from "metabook-client";
import PromptStateStore from "./promptStateStore";

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
  }
}

// If you cancel, the completion promise rejects with CancelledError
export default function promptStateInitialImportOperation(
  userClient: MetabookUserClient,
  promptStateStore: PromptStateStore,
): { cancel: () => void; completion: Promise<void> } {
  let isCancelled = false;
  let sharedReject: ((error: Error) => void) | null = null;
  return {
    cancel: () => {
      isCancelled = true;
      sharedReject?.(new CancelledError());
    },
    completion: new Promise(async (resolve, reject) => {
      sharedReject = reject;
      let afterServerTimestamp = await promptStateStore.getLatestLogServerTimestamp();
      let totalImported = 0;

      while (!isCancelled) {
        try {
          const promptStateCaches = await userClient.getPromptStates({
            limit: 500,
            updatedAfterServerTimestamp: afterServerTimestamp ?? undefined,
          });
          if (isCancelled) return;
          if (promptStateCaches.length > 0) {
            totalImported += promptStateCaches.length;
            console.log(
              `Prompt state import: imported ${promptStateCaches.length} prompt states (${totalImported} total)`,
            );
            afterServerTimestamp =
              promptStateCaches[promptStateCaches.length - 1]
                .latestLogServerTimestamp;
            await promptStateStore.savePromptStateCaches(promptStateCaches);
          } else {
            console.log("Prompt state import: finished");
            await promptStateStore.setHasFinishedInitialImport();
            if (!isCancelled) {
              resolve();
              break;
            }
          }
        } catch (error) {
          reject(error);
        }
      }
    }),
  };
}
