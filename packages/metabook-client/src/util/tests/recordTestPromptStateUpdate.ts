import {
  getIDForPromptTask,
  getIDForPrompt,
  PromptTaskID,
  PromptActionLog,
  repetitionActionLogType,
  PromptTaskParameters,
  PromptRepetitionOutcome,
  getActionLogFromPromptActionLog,
} from "metabook-core";
import { testBasicPrompt } from "metabook-sample-data";
import { MetabookUserClient } from "../../userClient/userClient";

export async function recordTestPromptStateUpdate(
  client: MetabookUserClient,
): Promise<{
  testPromptTaskID: PromptTaskID;
  testPromptActionLog: PromptActionLog<PromptTaskParameters>;
}> {
  const taskID = getIDForPromptTask({
    promptID: await getIDForPrompt(testBasicPrompt),
    promptType: testBasicPrompt.promptType,
    promptParameters: null,
  });
  const promptActionLog: PromptActionLog<PromptTaskParameters> = {
    actionLogType: repetitionActionLogType,
    taskID,
    taskParameters: null,
    outcome: PromptRepetitionOutcome.Remembered,
    context: "a",
    timestampMillis: 1000,
    parentActionLogIDs: [],
  };
  await client.recordActionLogs([
    getActionLogFromPromptActionLog(promptActionLog),
  ]);
  return {
    testPromptActionLog: promptActionLog,
    testPromptTaskID: taskID,
  };
}
