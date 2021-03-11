import { testApplicationPrompt, testQAPrompt } from "../__tests__/sampleData";
import { ActionLogID, getIDForActionLog } from "../actionLogID";
import { getIDForPrompt, PromptID } from "../promptID";
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
import { applicationPromptType, qaPromptType } from "../types/prompt";
import {
  getActionLogFromPromptActionLog,
  PromptActionLog,
  PromptIngestActionLog,
  PromptRepetitionActionLog,
} from "../types/promptActionLog";
import {
  getIDForPromptTask,
  PromptTaskID,
  QAPromptTask,
} from "../types/promptTask";
import applyActionLogToPromptState, {
  updateBaseHeadActionLogIDs,
} from "./applyActionLogToPromptState";
import { PromptState } from "./promptState";

const testSchedule = "default";
const scheduleSequence = getIntervalSequenceForSchedule(testSchedule);
let testQAPromptID: PromptID;
let testQAPromptTaskID: PromptTaskID;

beforeAll(async () => {
  testQAPromptID = await getIDForPrompt(testQAPrompt);
  testQAPromptTaskID = getIDForPromptTask({
    promptID: testQAPromptID,
    promptType: qaPromptType,
    promptParameters: null,
  });
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

let testIngestLog: PromptIngestActionLog;
let testIngestLogID: ActionLogID;

beforeAll(async () => {
  testIngestLog = {
    actionLogType: ingestActionLogType,
    timestampMillis: 1000,
    taskID: testQAPromptTaskID,
    provenance: null,
  };
  testIngestLogID = await getIDForActionLog(
    getActionLogFromPromptActionLog(testIngestLog),
  );
});
describe("ingesting", () => {
  test("without a base state", () => {
    expect(
      applyActionLogToPromptState({
        promptActionLog: testIngestLog,
        actionLogID: testIngestLogID,
        basePromptState: null,
        schedule: testSchedule,
      }),
    ).toMatchObject({
      bestIntervalMillis: null,
      dueTimestampMillis: testIngestLog.timestampMillis,
      headActionLogIDs: [testIngestLogID],
      intervalMillis: 0,
      lastReviewTimestampMillis: testIngestLog.timestampMillis,
      needsRetry: false,
      lastReviewTaskParameters: null,
    } as PromptState);
  });

  test("with a base state", async () => {
    const basePromptState: PromptState = {
      bestIntervalMillis: null,
      dueTimestampMillis: scheduleSequence[1].interval,
      headActionLogIDs: [
        await getIDForActionLog(
          getActionLogFromPromptActionLog({
            ...testIngestLog,
            timestampMillis: 500,
          }),
        ),
      ],
      taskMetadata: { isDeleted: false, provenance: null },
      intervalMillis: scheduleSequence[1].interval,
      lastReviewTimestampMillis: 500,
      needsRetry: false,
      lastReviewTaskParameters: null,
    };
    expect(
      applyActionLogToPromptState({
        promptActionLog: testIngestLog,
        actionLogID: testIngestLogID,
        basePromptState,
        schedule: testSchedule,
      }),
    ).toMatchObject({
      ...basePromptState,
      headActionLogIDs: [...basePromptState.headActionLogIDs, testIngestLogID],
    });
  });
});

let testRepetitionLog: PromptRepetitionActionLog<QAPromptTask>;
let testRepetitionLogID: ActionLogID;
beforeAll(async () => {
  testRepetitionLog = {
    actionLogType: repetitionActionLogType,
    timestampMillis: 1000,
    outcome: PromptRepetitionOutcome.Remembered,
    parentActionLogIDs: [],
    taskParameters: null,
    context: null,
    taskID: testQAPromptTaskID,
  };
  testRepetitionLogID = await getIDForActionLog(
    getActionLogFromPromptActionLog(testRepetitionLog),
  );
});

describe("repetition", () => {
  describe("without a base state", () => {
    test("remembering", () => {
      expect(
        applyActionLogToPromptState({
          promptActionLog: testRepetitionLog,
          actionLogID: testRepetitionLogID,
          basePromptState: null,
          schedule: testSchedule,
        }),
      ).toMatchObject({
        bestIntervalMillis: scheduleSequence[0].interval,
        dueTimestampMillis:
          testRepetitionLog.timestampMillis + scheduleSequence[1].interval,
        headActionLogIDs: [testRepetitionLogID],
        intervalMillis: scheduleSequence[1].interval,
        lastReviewTimestampMillis: testRepetitionLog.timestampMillis,
        needsRetry: false,
        lastReviewTaskParameters: null,
      } as PromptState);
    });

    test("forgetting", async () => {
      const log = {
        ...testRepetitionLog,
        outcome: PromptRepetitionOutcome.Forgotten,
      };
      const logID = await getIDForActionLog(log);

      const promptState = applyActionLogToPromptState({
        promptActionLog: log,
        actionLogID: logID,
        basePromptState: null,
        schedule: testSchedule,
      }) as PromptState;
      expect(promptState).toMatchObject({
        bestIntervalMillis: null,
        headActionLogIDs: [logID],
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

  describe("with a base state", () => {
    let basePromptState: PromptState;
    beforeAll(() => {
      basePromptState = applyActionLogToPromptState({
        promptActionLog: testIngestLog,
        actionLogID: testIngestLogID,
        basePromptState: null,
        schedule: testSchedule,
      }) as PromptState;
    });

    test("remembering", async () => {
      const log = {
        ...testRepetitionLog,
        parentActionLogIDs: [testRepetitionLogID],
        timestampMillis:
          testRepetitionLog.timestampMillis + scheduleSequence[3].interval + 50,
      };
      const nextPromptState = applyActionLogToPromptState({
        promptActionLog: log,
        actionLogID: await getIDForActionLog(log),
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

    test("forgetting", async () => {
      const log = {
        ...testRepetitionLog,
        outcome: PromptRepetitionOutcome.Forgotten,
        parentActionLogIDs: [testRepetitionLogID],
        timestampMillis:
          testRepetitionLog.timestampMillis + scheduleSequence[1].interval,
      };
      const nextPromptState = applyActionLogToPromptState({
        promptActionLog: log,
        actionLogID: await getIDForActionLog(log),
        basePromptState,
        schedule: testSchedule,
      }) as PromptState;
      expect(nextPromptState.dueTimestampMillis).toBeLessThan(
        log.timestampMillis + 1000 * 60 * 60,
      );
      expect(nextPromptState.bestIntervalMillis).toBeNull();
      expect(nextPromptState.intervalMillis).toBe(0);
    });
  });

  test("application prompts don't retry when forgotten", async () => {
    const log = {
      ...testRepetitionLog,
      taskID: getIDForPromptTask({
        promptID: await getIDForPrompt(testApplicationPrompt),
        promptType: applicationPromptType,
        promptParameters: null,
      }),
    };
    const logID = await getIDForActionLog(log);
    expect(
      (applyActionLogToPromptState({
        promptActionLog: log,
        actionLogID: logID,
        basePromptState: null,
        schedule: testSchedule,
      }) as PromptState).needsRetry,
    ).toBe(false);
  });
});

let newlyIngestedPromptState: PromptState;
beforeAll(async () => {
  newlyIngestedPromptState = applyActionLogToPromptState({
    promptActionLog: testIngestLog,
    actionLogID: testIngestLogID,
    basePromptState: null,
    schedule: "default",
  }) as PromptState;
});

describe("reschedule", () => {
  test("reschedules due time", async () => {
    const log: PromptActionLog = {
      actionLogType: rescheduleActionLogType,
      parentActionLogIDs: [testIngestLogID],
      timestampMillis: testIngestLog.timestampMillis + 100,
      taskID: testIngestLog.taskID,
      newTimestampMillis: 10000,
    };
    expect(
      (applyActionLogToPromptState({
        promptActionLog: log,
        actionLogID: await getIDForActionLog(log),
        basePromptState: newlyIngestedPromptState,
        schedule: "default",
      }) as PromptState).dueTimestampMillis,
    ).toEqual(10000);
  });
});

test("update metadata", async () => {
  const log: PromptActionLog = {
    actionLogType: updateMetadataActionLogType,
    parentActionLogIDs: [testIngestLogID],
    timestampMillis: testIngestLog.timestampMillis + 100,
    taskID: testIngestLog.taskID,
    updates: {
      isDeleted: true,
    },
  };
  expect(
    (applyActionLogToPromptState({
      promptActionLog: log,
      actionLogID: await getIDForActionLog(log),
      basePromptState: newlyIngestedPromptState,
      schedule: "default",
    }) as PromptState).taskMetadata.isDeleted,
  ).toBeTruthy();
});
