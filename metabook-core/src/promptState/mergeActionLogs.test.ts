import { testBasicPrompt } from "../__tests__/sampleData";
import { ActionLogID, getIDForActionLog } from "../actionLogID";
import { getIDForPrompt } from "../promptID";
import { PromptRepetitionOutcome } from "../spacedRepetition";
import {
  ingestActionLogType,
  repetitionActionLogType,
} from "../types/actionLog";
import { basicPromptType } from "../types/prompt";
import {
  getActionLogFromPromptActionLog,
  PromptIngestActionLog,
} from "../types/promptActionLog";
import { getIDForPromptTask, PromptTaskID } from "../types/promptTask";
import mergeActionLogs from "./mergeActionLogs";
import { PromptState } from "./promptState";

const testTaskID = getIDForPromptTask({
  promptType: basicPromptType,
  promptID: getIDForPrompt(testBasicPrompt),
  promptParameters: null,
});

const testIngestLog: PromptIngestActionLog = {
  actionLogType: ingestActionLogType,
  taskID: "y" as PromptTaskID,
  timestampMillis: 500,
  provenance: null,
};
const testIngestLogID = getIDForActionLog(
  getActionLogFromPromptActionLog(testIngestLog),
) as ActionLogID;

test("fails if base prompt state is disconnected", () => {
  expect(
    mergeActionLogs([testIngestLog], {
      headActionLogIDs: ["x" as ActionLogID],
    } as PromptState),
  ).toBeInstanceOf(Error);
});

test("fails if log is missing", () => {
  expect(
    mergeActionLogs(
      [
        {
          actionLogType: repetitionActionLogType,
          taskID: testTaskID,
          timestampMillis: 500,
          parentActionLogIDs: [testIngestLogID],
          taskParameters: null,
          outcome: PromptRepetitionOutcome.Remembered,
          context: null,
        },
      ],
      null,
    ),
  ).toBeInstanceOf(Error);
});

test("merges split log", () => {
  expect(
    mergeActionLogs(
      [
        testIngestLog,
        {
          actionLogType: repetitionActionLogType,
          taskID: testTaskID,
          timestampMillis: 500,
          parentActionLogIDs: [testIngestLogID],
          taskParameters: null,
          outcome: PromptRepetitionOutcome.Remembered,
          context: null,
        },
        {
          actionLogType: repetitionActionLogType,
          taskID: testTaskID,
          timestampMillis: 750,
          parentActionLogIDs: [testIngestLogID],
          taskParameters: null,
          outcome: PromptRepetitionOutcome.Remembered,
          context: null,
        },
      ],
      null,
    ),
  ).toBeTruthy();
});
