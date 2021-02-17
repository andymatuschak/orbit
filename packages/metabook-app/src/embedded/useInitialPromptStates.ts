import {
  getIDForPromptSync,
  getIDForPromptTask,
  PromptState,
  PromptTask,
  PromptTaskID,
} from "metabook-core";
import { UserClient } from "metabook-client";
import { ReviewItem } from "metabook-embedded-support";
import { useEffect, useState } from "react";
import serviceConfig from "../../serviceConfig.mjs";
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
      const userClient = new UserClient(
        async (request) => {
          const idToken = await authenticationClient.getCurrentIDToken();
          request.headers.set("Authorization", `ID ${idToken}`);
        },
        {
          baseURL: serviceConfig.httpsAPIBaseURLString,
        },
      );

      userClient.listTaskStates({ ids: taskIDs }).then((response) => {
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
