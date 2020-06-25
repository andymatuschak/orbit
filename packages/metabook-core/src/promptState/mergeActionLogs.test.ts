import { testBasicPrompt } from "../__tests__/sampleData";
import { ActionLogID, getIDForActionLog } from "../actionLogID";
import { getIDForPrompt } from "../promptID";
import { PromptRepetitionOutcome } from "../spacedRepetition";
import {
  ingestActionLogType,
  RepetitionActionLog,
  repetitionActionLogType,
} from "../types/actionLog";
import { basicPromptType } from "../types/prompt";
import {
  getActionLogFromPromptActionLog,
  PromptIngestActionLog,
  PromptRepetitionActionLog,
} from "../types/promptActionLog";
import { getIDForPromptTask, PromptTaskID } from "../types/promptTask";
import { PromptTaskParameters } from "../types/promptTaskParameters";
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

const testRepetitionLog: PromptRepetitionActionLog<PromptTaskParameters> = {
  actionLogType: repetitionActionLogType,
  taskID: testTaskID,
  timestampMillis: 500,
  parentActionLogIDs: [testIngestLogID],
  taskParameters: null,
  outcome: PromptRepetitionOutcome.Remembered,
  context: null,
};

const testRepetitionLogID = getIDForActionLog(
  getActionLogFromPromptActionLog(testRepetitionLog),
) as ActionLogID;

test("fails if log is missing", () => {
  expect(
    mergeActionLogs([{ log: testRepetitionLog, id: testRepetitionLogID }]),
  ).toBeInstanceOf(Error);
});

test("merges split log", () => {
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
        id: getIDForActionLog(
          getActionLogFromPromptActionLog(secondRepetitionLog),
        ),
      },
    ]),
  ).toBeTruthy();
});
