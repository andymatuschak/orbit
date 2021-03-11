import {
  ClozePromptTask,
  getClozeDeletionCount,
  getIDForPromptSync,
  getIDForPromptTask,
  getPromptTaskForID,
  ingestActionLogType,
  PromptRepetitionOutcome,
  RepetitionActionLog,
  repetitionActionLogType,
} from "@withorbit/core";
import { styles } from "metabook-ui";
import { EmbeddedHostMetadata } from "@withorbit/embedded-support";
import { testClozePrompt } from "@withorbit/sample-data";
import { getActionsRecordForMarking } from "./markingActions";

test("clozes ingest all deletions", () => {
  const promptParameters = { clozeIndex: 0 };
  const actionsRecord = getActionsRecordForMarking({
    hostMetadata: {} as EmbeddedHostMetadata,
    reviewItem: {
      prompt: testClozePrompt,
      promptParameters,
      promptState: null,
      attachmentResolutionMap: null,
      promptTaskID: getIDForPromptTask({
        promptID: getIDForPromptSync(testClozePrompt),
        promptParameters,
        promptType: testClozePrompt.promptType,
      }),
    },
    markingRecord: {
      reviewAreaItem: {
        prompt: testClozePrompt,
        promptParameters,
        taskParameters: null,
        attachmentResolutionMap: null,
        colorPalette: styles.colors.palettes.red,
        provenance: null,
      },
      outcome: PromptRepetitionOutcome.Remembered,
    },
    sessionStartTimestampMillis: 0,
    markingTimestampMillis: 1000,
  });

  const ingestLogEntries = actionsRecord.logEntries.filter(
    (entry) => entry.log.actionLogType === ingestActionLogType,
  );
  const clozeDeletionCount = getClozeDeletionCount(testClozePrompt);
  expect(ingestLogEntries).toHaveLength(clozeDeletionCount);

  const clozeIndexes = ingestLogEntries
    .map(
      (entry) =>
        (getPromptTaskForID(entry.log.taskID) as ClozePromptTask)
          .promptParameters.clozeIndex,
    )
    .sort();
  expect(clozeIndexes).toMatchObject(
    Array.from(new Array(clozeDeletionCount).keys()),
  );

  const reviewedLogEntry = actionsRecord.logEntries.find(
    (entry) =>
      (getPromptTaskForID(entry.log.taskID) as ClozePromptTask).promptParameters
        .clozeIndex === 0,
  )!;
  expect(reviewedLogEntry).toBeTruthy();

  const repetitionLogEntries = actionsRecord.logEntries.filter(
    (entry) => entry.log.actionLogType === repetitionActionLogType,
  );
  expect(repetitionLogEntries).toHaveLength(1);
  expect(
    (repetitionLogEntries[0].log as RepetitionActionLog).parentActionLogIDs,
  ).toMatchObject([reviewedLogEntry.id]);
});
