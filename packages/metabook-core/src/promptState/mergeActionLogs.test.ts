import { testQAPrompt } from "../__tests__/sampleData";
import { ActionLogID, getIDForActionLog } from "../actionLogID";
import { getIDForPrompt } from "../promptID";
import { PromptRepetitionOutcome } from "../spacedRepetition";
import {
  ingestActionLogType,
  repetitionActionLogType,
} from "../types/actionLog";
import { qaPromptType } from "../types/prompt";
import {
  getActionLogFromPromptActionLog,
  PromptIngestActionLog,
  PromptRepetitionActionLog,
} from "../types/promptActionLog";
import {
  getIDForPromptTask,
  PromptTaskID,
  PromptTaskParameters,
  QAPromptTask,
} from "../types/promptTask";
import { mergeActionLogs } from "./mergeActionLogs";

let testIngestLog: PromptIngestActionLog;
let testIngestLogID: ActionLogID;
let testRepetitionLog: PromptRepetitionActionLog<QAPromptTask>;
let testRepetitionLogID: ActionLogID;

beforeAll(async () => {
  const testTaskID = getIDForPromptTask({
    promptType: qaPromptType,
    promptID: await getIDForPrompt(testQAPrompt),
    promptParameters: null,
  });

  testIngestLog = {
    actionLogType: ingestActionLogType,
    taskID: "y" as PromptTaskID,
    timestampMillis: 500,
    provenance: null,
  };

  testIngestLogID = (await getIDForActionLog(
    getActionLogFromPromptActionLog(testIngestLog),
  )) as ActionLogID;

  testRepetitionLog = {
    actionLogType: repetitionActionLogType,
    taskID: testTaskID,
    timestampMillis: 500,
    parentActionLogIDs: [testIngestLogID],
    taskParameters: null,
    outcome: PromptRepetitionOutcome.Remembered,
    context: null,
  };

  testRepetitionLogID = (await getIDForActionLog(
    getActionLogFromPromptActionLog(testRepetitionLog),
  )) as ActionLogID;
});

test("fails if log is missing", () => {
  expect(
    mergeActionLogs([{ log: testRepetitionLog, id: testRepetitionLogID }]),
  ).toBeInstanceOf(Error);
});

test("merges split log", async () => {
  const secondRepetitionLog = { ...testRepetitionLog, timestampMillis: 750 };
  expect(
    mergeActionLogs([
      { log: testIngestLog, id: testIngestLogID },
      {
        log: testRepetitionLog,
        id: testRepetitionLogID,
      },
      {
        log: secondRepetitionLog,
        id: await getIDForActionLog(
          getActionLogFromPromptActionLog(secondRepetitionLog),
        ),
      },
    ]),
  ).toBeTruthy();
});
