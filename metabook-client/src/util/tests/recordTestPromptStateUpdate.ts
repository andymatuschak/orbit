import {
  encodePrompt,
  getIDForPromptSpec,
  PromptID,
  PromptState,
} from "metabook-core";
import { testBasicPromptSpec } from "metabook-sample-data";
import { MetabookUserClient } from "../../userClient/userClient";

export function recordTestPromptStateUpdate(
  client: MetabookUserClient,
): {
  newPromptState: PromptState;
  testPromptID: PromptID;
  commit: Promise<unknown>;
} {
  return {
    ...client.recordAction({
      promptSpec: testBasicPromptSpec,
      promptParameters: null,
      promptTaskParameters: null,
      basePromptState: null,
      actionOutcome: "remembered",
      sessionID: "a",
      timestampMillis: 1000,
    }),
    testPromptID: encodePrompt({
      promptSpecID: getIDForPromptSpec(testBasicPromptSpec),
      promptParameters: null,
    }),
  };
}
