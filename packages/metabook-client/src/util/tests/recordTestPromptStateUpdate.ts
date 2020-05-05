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

export function recordTestPromptStateUpdate(
  client: MetabookUserClient,
): {
  testPromptTaskID: PromptTaskID;
  testPromptActionLog: PromptActionLog<PromptTaskParameters>;
  commit: Promise<unknown>;
} {
  const taskID = getIDForPromptTask({
    promptID: getIDForPrompt(testBasicPrompt),
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
  return {
    commit: client.recordActionLogs([
      getActionLogFromPromptActionLog(promptActionLog),
    ]),
    testPromptActionLog: promptActionLog,
    testPromptTaskID: taskID,
  };
}
