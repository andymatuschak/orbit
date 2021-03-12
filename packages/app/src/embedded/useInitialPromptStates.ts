import {
  getIDForPromptSync,
  getIDForPromptTask,
  PromptState,
  PromptTask,
  PromptTaskID,
} from "@withorbit/core";
import OrbitAPIClient from "@withorbit/api-client";
import { ReviewItem } from "@withorbit/embedded-support";
import { useEffect, useState } from "react";
import serviceConfig from "../../serviceConfig";
import { AuthenticationClient } from "../authentication";
import { sendUpdatedReviewItemToHost } from "./ipc/sendUpdatedReviewItemToHost";
import { EmbeddedAuthenticationState } from "./useEmbeddedAuthenticationState";

export function useInitialPromptStates({
  authenticationClient,
  authenticationState,
  embeddedReviewItems,
  shouldRequestInitialPrompts,
}: {
  authenticationClient: AuthenticationClient;
  authenticationState: EmbeddedAuthenticationState;
  embeddedReviewItems: ReviewItem[] | null;
  shouldRequestInitialPrompts: boolean;
}): Map<PromptTaskID, PromptState> | null {
  const [initialPromptStates, setInitialPromptStates] = useState<Map<
    PromptTaskID,
    PromptState
  > | null>(null);

  const status = authenticationState.status;
  useEffect(() => {
    if (
      status === "signedIn" &&
      initialPromptStates === null &&
      embeddedReviewItems &&
      shouldRequestInitialPrompts
    ) {
      // Get all the task IDs.
      const taskIDs = embeddedReviewItems.map((item) => {
        return getIDForPromptTask({
          promptID: getIDForPromptSync(item.prompt),
          promptType: item.prompt.promptType,
          promptParameters: item.promptParameters,
        } as PromptTask);
      });

      // TODO: extract, share
      const userClient = new OrbitAPIClient(
        async () => {
          return {
            idToken: (await authenticationClient.getCurrentIDToken()) as string,
          };
        },
        {
          baseURL: serviceConfig.httpsAPIBaseURLString,
        },
      );

      userClient.getTaskStates(taskIDs).then((response) => {
        const output = new Map<PromptTaskID, PromptState>();
        for (const { id, data } of response.data) {
          output.set(id, data);
          sendUpdatedReviewItemToHost(id, data);
        }
        setInitialPromptStates(output);
      });
    }
  }, [
    authenticationClient,
    embeddedReviewItems,
    initialPromptStates,
    shouldRequestInitialPrompts,
    status,
  ]);

  return initialPromptStates;
}
