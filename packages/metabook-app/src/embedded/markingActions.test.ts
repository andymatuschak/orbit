import {
  ClozePromptTask,
  getClozeDeletionCount,
  getPromptTaskForID,
  ingestActionLogType,
  PromptRepetitionOutcome,
  RepetitionActionLog,
  repetitionActionLogType,
} from "metabook-core";
import { EmbeddedHostMetadata } from "metabook-embedded-support";
import { testClozePrompt } from "metabook-sample-data";
import { promptReviewItemType } from "metabook-ui";
import { getActionsRecordForMarking } from "./markingActions";

test("clozes ingest all deletions", () => {
  const actionsRecord = getActionsRecordForMarking(
    {} as EmbeddedHostMetadata,
    {
      reviewItem: {
        prompt: testClozePrompt,
        promptParameters: { clozeIndex: 0 },
        attachmentResolutionMap: null,
        promptState: null,
        reviewItemType: promptReviewItemType,
      },
      outcome: PromptRepetitionOutcome.Remembered,
    },
    0,
    1000,
  );

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
