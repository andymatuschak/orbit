import { PromptState, PromptSpecID } from "metabook-core";
import { MetabookUserClient } from "../../userClient/userClient";

export function recordTestPromptStateUpdate(
  client: MetabookUserClient,
  promptSpecIDString: string,
): { newPromptState: PromptState; commit: Promise<unknown> } {
  return client.recordAction({
    promptTaskID: {
      promptSpecID: promptSpecIDString as PromptSpecID,
      promptSpecType: "basic",
    },
    basePromptState: null,
    actionOutcome: "remembered",
    sessionID: "a",
    timestampMillis: 1000,
  });
}
