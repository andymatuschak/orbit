import {
  getActionLogFromPromptActionLog,
  getIDForPrompt,
  getIDForPromptTask,
  PromptActionLog,
  PromptRepetitionOutcome,
  PromptTaskID,
  QAPromptTask,
  repetitionActionLogType,
} from "metabook-core";
import { testQAPrompt } from "metabook-sample-data";
import { MetabookUserClient } from "../../userClient/userClient";

export async function recordTestPromptStateUpdate(
  client: MetabookUserClient,
): Promise<{
  testPromptTaskID: PromptTaskID;
  testPromptActionLog: PromptActionLog;
}> {
  const taskID = getIDForPromptTask({
    promptID: await getIDForPrompt(testQAPrompt),
    promptType: testQAPrompt.promptType,
    promptParameters: null,
  });
  const promptActionLog: PromptActionLog<QAPromptTask> = {
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
