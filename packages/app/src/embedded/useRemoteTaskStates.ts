import OrbitAPIClient from "@withorbit/api-client";
import { Task, TaskID } from "@withorbit/core2";
import { ReviewItem } from "@withorbit/embedded-support";
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
          sendUpdatedReviewItemToHost(task);
        }
        setInitialTaskStates(output);
      });
    }
  }, [apiClient, embeddedReviewItems, initialTaskStates, status]);

  return initialTaskStates;
}
