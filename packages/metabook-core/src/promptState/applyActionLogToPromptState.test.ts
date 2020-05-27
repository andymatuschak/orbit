import {
  testApplicationPrompt,
  testBasicPrompt,
} from "../__tests__/sampleData";
import { ActionLogID, getIDForActionLog } from "../actionLogID";
import { getIDForPrompt } from "../promptID";
import {
  getIntervalSequenceForSchedule,
  PromptRepetitionOutcome,
} from "../spacedRepetition";
import {
  ingestActionLogType,
  repetitionActionLogType,
  rescheduleActionLogType,
  updateMetadataActionLogType,
} from "../types/actionLog";
import { applicationPromptType, basicPromptType } from "../types/prompt";
import {
  getActionLogFromPromptActionLog,
  PromptIngestActionLog,
  PromptRepetitionActionLog,
} from "../types/promptActionLog";
import { getIDForPromptTask } from "../types/promptTask";
import { BasicPromptTaskParameters } from "../types/promptTaskParameters";
import applyActionLogToPromptState, {
  updateBaseHeadActionLogIDs,
} from "./applyActionLogToPromptState";
import { PromptState } from "./promptState";

const testSchedule = "default";
const scheduleSequence = getIntervalSequenceForSchedule(testSchedule);
const testBasicPromptID = getIDForPrompt(testBasicPrompt);
const testBasicPromptTaskID = getIDForPromptTask({
  promptID: testBasicPromptID,
  promptType: basicPromptType,
  promptParameters: null,
});

function asID(id: string): ActionLogID {
  return id as ActionLogID;
}

describe("updateBaseHeadActionLogIDs", () => {
  test("single ID fast-forward", () => {
    expect(
      updateBaseHeadActionLogIDs([asID("a")], [asID("a")], asID("b")),
    ).toEqual([asID("b")]);
  });

  test("multiple ID fast-forward", () => {
    expect(
      updateBaseHeadActionLogIDs(
        [asID("a"), asID("b")],
        [asID("a"), asID("b")],
        asID("c"),
      ),
    ).toEqual([asID("c")]);
  });

  test("merge", () => {
    expect(
      updateBaseHeadActionLogIDs([asID("a")], [asID("b")], asID("c")),
    ).toEqual([asID("a"), asID("c")]);
  });

  test("partial merge", () => {
    expect(
      updateBaseHeadActionLogIDs(
        [asID("a"), asID("b")],
        [asID("a")],
        asID("c"),
      ),
    ).toEqual([asID("b"), asID("c")]);
  });

  test("idempotence", () => {
    expect(
      updateBaseHeadActionLogIDs(
        [asID("c"), asID("a")],
        [asID("b")],
        asID("c"),
      ),
    ).toEqual([asID("c"), asID("a")]);
  });
});

const testIngestLog: PromptIngestActionLog = {
  actionLogType: ingestActionLogType,
  timestampMillis: 1000,
  taskID: testBasicPromptTaskID,
  provenance: null,
};
const testIngestLogID = getIDForActionLog(
  getActionLogFromPromptActionLog(testIngestLog),
);
describe("ingesting", () => {
  test("without a base state", () => {
    expect(
      applyActionLogToPromptState({
        promptActionLog: testIngestLog,
        basePromptState: null,
        schedule: testSchedule,
      }),
    ).toMatchObject({
      bestIntervalMillis: null,
      dueTimestampMillis:
        testIngestLog.timestampMillis + scheduleSequence[1].interval,
      headActionLogIDs: [testIngestLogID],
      intervalMillis: scheduleSequence[1].interval,
      lastReviewTimestampMillis: testIngestLog.timestampMillis,
      needsRetry: false,
      lastReviewTaskParameters: null,
    } as PromptState);
  });

  test("with a base state", () => {
    const basePromptState: PromptState = {
      bestIntervalMillis: null,
      dueTimestampMillis: scheduleSequence[1].interval,
      headActionLogIDs: [
        getIDForActionLog(
          getActionLogFromPromptActionLog({
            ...testIngestLog,
            timestampMillis: 500,
          }),
        ),
      ],
      taskMetadata: { isDeleted: false },
      intervalMillis: scheduleSequence[1].interval,
      lastReviewTimestampMillis: 500,
      needsRetry: false,
      lastReviewTaskParameters: null,
      provenance: null,
    };
    expect(
      applyActionLogToPromptState({
        promptActionLog: testIngestLog,
        basePromptState,
        schedule: testSchedule,
      }),
    ).toMatchObject({
      ...basePromptState,
      headActionLogIDs: [...basePromptState.headActionLogIDs, testIngestLogID],
    });
  });
});

describe("repetition", () => {
  const testRepetitionLog: PromptRepetitionActionLog<BasicPromptTaskParameters> = {
    actionLogType: repetitionActionLogType,
    timestampMillis: 1000,
    outcome: PromptRepetitionOutcome.Remembered,
    parentActionLogIDs: [],
    taskParameters: null,
    context: null,
    taskID: testBasicPromptTaskID,
  };

  describe("without a base state", () => {
    test("remembering", () => {
      expect(
        applyActionLogToPromptState({
          promptActionLog: testRepetitionLog,
          basePromptState: null,
          schedule: testSchedule,
        }),
      ).toMatchObject({
        bestIntervalMillis: scheduleSequence[0].interval,
        dueTimestampMillis:
          testRepetitionLog.timestampMillis + scheduleSequence[1].interval,
        headActionLogIDs: [
          getIDForActionLog(getActionLogFromPromptActionLog(testRepetitionLog)),
        ],
        intervalMillis: scheduleSequence[1].interval,
        lastReviewTimestampMillis: testRepetitionLog.timestampMillis,
        needsRetry: false,
        lastReviewTaskParameters: null,
      } as PromptState);
    });

    test("forgetting", () => {
      const log = {
        ...testRepetitionLog,
        outcome: PromptRepetitionOutcome.Forgotten,
      };

      const promptState = applyActionLogToPromptState({
        promptActionLog: log,
        basePromptState: null,
        schedule: testSchedule,
      }) as PromptState;
      expect(promptState).toMatchObject({
        bestIntervalMillis: null,
        headActionLogIDs: [
          getIDForActionLog(getActionLogFromPromptActionLog(log)),
        ],
        intervalMillis: scheduleSequence[0].interval,
        lastReviewTimestampMillis: testRepetitionLog.timestampMillis,
        needsRetry: true,
        lastReviewTaskParameters: null,
      } as PromptState);
      expect(promptState.dueTimestampMillis).toBeGreaterThan(
        log.timestampMillis,
      );
      expect(promptState.dueTimestampMillis).toBeLessThan(
        log.timestampMillis + scheduleSequence[1].interval,
      );
    });
  });

  test("with a base state", () => {
    const basePromptState = applyActionLogToPromptState({
      promptActionLog: testRepetitionLog,
      basePromptState: null,
      schedule: testSchedule,
    }) as PromptState;
    const log = {
      ...testRepetitionLog,
      parentActionLogIDs: [
        getIDForActionLog(getActionLogFromPromptActionLog(testRepetitionLog)),
      ],
      timestampMillis:
        testRepetitionLog.timestampMillis + scheduleSequence[3].interval + 50,
    };
    const nextPromptState = applyActionLogToPromptState({
      promptActionLog: log,
      basePromptState,
      schedule: testSchedule,
    }) as PromptState;
    expect(nextPromptState.dueTimestampMillis).toBeGreaterThan(
      log.timestampMillis + nextPromptState.intervalMillis,
    );
    expect(nextPromptState.dueTimestampMillis).toBeLessThan(
      log.timestampMillis + nextPromptState.intervalMillis + 1000 * 60 * 10,
    );
    expect(nextPromptState.bestIntervalMillis).toEqual(
      log.timestampMillis - testRepetitionLog.timestampMillis,
    );
    expect(nextPromptState.intervalMillis).toBeGreaterThanOrEqual(
      scheduleSequence[4].interval,
    );
  });

  test("application prompts don't retry when forgotten", () => {
    expect(
      (applyActionLogToPromptState({
        promptActionLog: {
          ...testRepetitionLog,
          taskID: getIDForPromptTask({
            promptID: getIDForPrompt(testApplicationPrompt),
            promptType: applicationPromptType,
            promptParameters: null,
          }),
        },
        basePromptState: null,
        schedule: testSchedule,
      }) as PromptState).needsRetry,
    ).toBe(false);
  });
});

const newlyIngestedPromptState = applyActionLogToPromptState({
  promptActionLog: testIngestLog,
  basePromptState: null,
  schedule: "default",
}) as PromptState;

describe("reschedule", () => {
  test("reschedules due time", () => {
    expect(
      (applyActionLogToPromptState({
        promptActionLog: {
          actionLogType: rescheduleActionLogType,
          parentActionLogIDs: [testIngestLogID],
          timestampMillis: testIngestLog.timestampMillis + 100,
          taskID: testIngestLog.taskID,
          newTimestampMillis: 10000,
        },
        basePromptState: newlyIngestedPromptState,
        schedule: "default",
      }) as PromptState).dueTimestampMillis,
    ).toEqual(10000);
  });
});

test("update metadata", () => {
  expect(
    (applyActionLogToPromptState({
      promptActionLog: {
        actionLogType: updateMetadataActionLogType,
        parentActionLogIDs: [testIngestLogID],
        timestampMillis: testIngestLog.timestampMillis + 100,
        taskID: testIngestLog.taskID,
        updates: {
          isDeleted: true,
        },
      },
      basePromptState: newlyIngestedPromptState,
      schedule: "default",
    }) as PromptState).taskMetadata.isDeleted,
  ).toBeTruthy();
});
