import {
  getIDForPromptSync,
  getIDForPromptTask,
  PromptState,
  PromptTask,
  PromptTaskID,
} from "metabook-core";
import { ReviewItem } from "metabook-embedded-support";
import { useEffect, useState } from "react";
import serviceConfig from "../../serviceConfig.mjs";
import { AuthenticationClient } from "../authentication";
import { sendUpdatedReviewItemToHost } from "./ipc/sendUpdatedReviewItemToHost";
import { EmbeddedAuthenticationState } from "./useEmbeddedAuthenticationState";

export function useInitialPromptStates(
  authenticationClient: AuthenticationClient,
  authenticationState: EmbeddedAuthenticationState,
  embeddedReviewItems: ReviewItem[] | null,
): Map<PromptTaskID, PromptState> | null {
  const [initialPromptStates, setInitialPromptStates] = useState<Map<
    PromptTaskID,
    PromptState
  > | null>(null);

  const status = authenticationState.status;
  useEffect(() => {
    if (
      status === "signedIn" &&
      initialPromptStates === null &&
      embeddedReviewItems
    ) {
      authenticationClient.getCurrentIDToken().then(async (idToken) => {
        // Get all the task IDs.
        const taskIDs = embeddedReviewItems.map((item) => {
          return getIDForPromptTask({
            promptID: getIDForPromptSync(item.prompt),
            promptType: item.prompt.promptType,
            promptParameters: item.promptParameters,
          } as PromptTask);
        });

        const taskIDParameterSegment = taskIDs
          .map((taskID) => `taskID=${encodeURIComponent(taskID)}`)
          .join("&");

        // TODO: extract
        const url = `${serviceConfig.httpsAPIBaseURLString}/taskStates?${taskIDParameterSegment}`;
        const request = new Request(url);
        request.headers.set("Authorization", `ID ${idToken}`);
        const fetchResult = await fetch(request);
        if (!fetchResult.ok) {
          throw new Error(
            `Failed to fetch prompt states with status code ${
              fetchResult.status
            }: ${await fetchResult.text()}`,
          );
        }

        const response = await fetchResult.json();
        if (typeof response !== "object") {
          throw new Error(`Unexpected prompt state response: ${response}`);
        }
        const output = new Map<PromptTaskID, PromptState>();
        embeddedReviewItems.forEach((item, index) => {
          const taskID = taskIDs[index];
          // TODO: validate prompt states
          const promptState = response[taskID];
          if (promptState) {
            output.set(item.promptTaskID, promptState);
            sendUpdatedReviewItemToHost(taskID, promptState);
          }
        });
        setInitialPromptStates(output);
      });
    }
  }, [authenticationClient, embeddedReviewItems, initialPromptStates, status]);

  return initialPromptStates;
}
