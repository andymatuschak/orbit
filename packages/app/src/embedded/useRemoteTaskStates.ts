import OrbitAPIClient from "@withorbit/api-client";
import { ReviewItem, Task, TaskID } from "@withorbit/core";
import { useEffect, useState } from "react";
import { sendUpdatedReviewItemToHost } from "./ipc/sendUpdatedReviewItemToHost";
import { EmbeddedAuthenticationState } from "./useEmbeddedAuthenticationState";

export function useRemoteTaskStates({
  apiClient,
  authenticationState,
  embeddedReviewItems,
}: {
  apiClient: OrbitAPIClient;
  authenticationState: EmbeddedAuthenticationState;
  embeddedReviewItems: ReviewItem[];
}): Map<TaskID, Task> | null {
  const [initialTaskStates, setInitialTaskStates] = useState<Map<
    TaskID,
    Task
  > | null>(null);

  const status = authenticationState.status;
  useEffect(() => {
    if (status === "signedIn" && initialTaskStates === null) {
      const taskIDs = embeddedReviewItems.map((item) => item.task.id);

      apiClient.getTasks2(taskIDs).then((response) => {
        const output = new Map<TaskID, Task>();
        for (const task of response.items) {
          output.set(task.id, task);
          // TODO: reconcile this nonsense -- my note on the hack no longer applies; this will now be excecuted!
          // HACK HACK HACK: 0 is not a real value; this code should never execute in the demo.
          sendUpdatedReviewItemToHost(task, 0, 0);
        }
        setInitialTaskStates(output);
      });
    }
  }, [apiClient, embeddedReviewItems, initialTaskStates, status]);

  return initialTaskStates;
}
