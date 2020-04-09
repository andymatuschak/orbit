import {
  encodePromptTask,
  getIDForPrompt,
  PromptTaskID,
  PromptState,
} from "metabook-core";
import { testBasicPrompt } from "metabook-sample-data";
import { MetabookUserClient } from "../../userClient/userClient";

export function recordTestPromptStateUpdate(
  client: MetabookUserClient,
): {
  newPromptState: PromptState;
  testPromptTaskID: PromptTaskID;
  commit: Promise<unknown>;
} {
  return {
    ...client.recordAction({
      prompt: testBasicPrompt,
      promptParameters: null,
      promptTaskParameters: null,
      basePromptState: null,
      actionOutcome: "remembered",
      sessionID: "a",
      timestampMillis: 1000,
    }),
    testPromptTaskID: encodePromptTask({
      promptID: getIDForPrompt(testBasicPrompt),
      promptParameters: null,
    }),
  };
}
