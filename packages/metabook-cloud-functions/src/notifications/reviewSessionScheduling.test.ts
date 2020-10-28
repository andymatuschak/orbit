import { generateDuePromptStates } from "./__fixtures__/generateDuePromptStates";
import { evaluateReviewSessionSchedule } from "./reviewSessionScheduling";

describe("shouldScheduleReviewSession", () => {
  const baseTimestampMillis = Date.now();
  test("no review session when no prompts are due", () => {
    expect(
      evaluateReviewSessionSchedule(baseTimestampMillis, [], 100),
    ).toMatchObject({
      shouldScheduleSession: false,
      reason: "no-prompts-due",
    });
  });

  test("review session due now when too many prompts due", () => {
    expect(
      evaluateReviewSessionSchedule(
        baseTimestampMillis,
        generateDuePromptStates(baseTimestampMillis, 100, 0, 5),
        100,
      ),
    ).toMatchObject({
      shouldScheduleSession: true,
      reason: "full-session-ready",
    });
  });

  test("review session due now when no other prompts are due soon", () => {
    expect(
      evaluateReviewSessionSchedule(
        baseTimestampMillis,
        generateDuePromptStates(baseTimestampMillis, 10, 0, 5),
        100,
      ),
    ).toMatchObject({
      shouldScheduleSession: true,
      reason: "no-better-session-soon",
    });
  });

  test("review session due now when many prompts due later today", () => {
    expect(
      evaluateReviewSessionSchedule(
        baseTimestampMillis,
        generateDuePromptStates(baseTimestampMillis, 100, 0.5, 5),
        100,
      ),
    ).toMatchObject({
      shouldScheduleSession: true,
      reason: "full-session-ready",
    });
  });

  test("review session due now when batching would make prompts too overdue", () => {
    expect(
      evaluateReviewSessionSchedule(
        baseTimestampMillis,
        [
          ...generateDuePromptStates(baseTimestampMillis, 10, -5, 5),
          ...generateDuePromptStates(baseTimestampMillis, 50, 6, 5),
        ],
        100,
      ),
    ).toMatchObject({
      shouldScheduleSession: true,
      reason: "no-better-session-soon",
    });
  });

  test("review session due now when batching would too many prompts are overdue", () => {
    expect(
      evaluateReviewSessionSchedule(
        baseTimestampMillis,
        [
          ...generateDuePromptStates(baseTimestampMillis, 20, -5, 5),
          ...generateDuePromptStates(baseTimestampMillis, 50, 2, 5),
        ],
        100,
      ),
    ).toMatchObject({
      shouldScheduleSession: true,
      reason: "too-many-overdue",
    });
  });

  test("review session delayed when more prompts available soon", () => {
    expect(
      evaluateReviewSessionSchedule(
        baseTimestampMillis,
        [
          ...generateDuePromptStates(baseTimestampMillis, 10, -3, 5),
          ...generateDuePromptStates(baseTimestampMillis, 50, 3, 5),
        ],
        100,
      ),
    ).toMatchObject({
      shouldScheduleSession: false,
      reason: "fuller-session-soon",
    });
  });

  test("review due immediately when user has few prompts and all are due", () => {
    expect(
      evaluateReviewSessionSchedule(
        baseTimestampMillis,

        generateDuePromptStates(baseTimestampMillis, 10, 0, 5),
        10,
      ),
    ).toMatchObject({
      shouldScheduleSession: true,
      reason: "full-session-ready",
    });
  });

  test("review due immediately when user has an unknown prompt count and many are due", () => {
    expect(
      evaluateReviewSessionSchedule(
        baseTimestampMillis,

        generateDuePromptStates(baseTimestampMillis, 200, 0, 5),
        null,
      ),
    ).toMatchObject({
      shouldScheduleSession: true,
      reason: "full-session-ready",
    });
  });
});
