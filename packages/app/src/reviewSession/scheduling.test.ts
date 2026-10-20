import {
  createVaultSchedulerAdapter,
  defaultOrbitSchedulerPolicy,
  TaskRepetitionOutcome,
  type FSRSSchedulerPolicy,
  type ReviewItem,
  type TaskID,
  type ObservationID,
  type VaultMutationID,
} from "@withorbit/core";
import { default_w } from "ts-fsrs";
import { expect, test } from "bun:test";
import {
  getReviewIntervalAfterOutcome,
  getTaskAfterReview,
  itemIsStillDue,
  type ReviewMutation,
} from "./scheduling.js";

const day = 86_400_000;
const now = Date.UTC(2026, 9, 14);
const item = {
  task: {
    id: "preview-task" as TaskID,
    componentStates: {
      main: {
        createdAtTimestampMillis: now - 20 * day,
        lastRepetitionTimestampMillis: now - 10 * day,
        intervalMillis: 5 * day,
        dueTimestampMillis: now - 5 * day,
      },
    },
  },
  componentID: "main",
} as unknown as ReviewItem;

test("Orbit preview uses absolute review time and returns an interval, not a due timestamp", () => {
  expect(
    getReviewIntervalAfterOutcome(
      item,
      defaultOrbitSchedulerPolicy,
      TaskRepetitionOutcome.Remembered,
      now,
    ),
  ).toBe(Math.floor(10 * day * 2.3));
});

test("FSRS preview uses the selected vault policy, not the old fixed-growth scheduler", () => {
  const policy: FSRSSchedulerPolicy = {
    kind: "fsrs",
    version: 1,
    modelVersion: 6,
    weights: [...default_w],
    requestedRetention: 0.9,
    cutoverTimestampMillis: now,
    previousPolicy: defaultOrbitSchedulerPolicy,
  };
  const expected = createVaultSchedulerAdapter(policy).applyReview(
    item.task.componentStates.main,
    {
      kind: "review",
      taskID: item.task.id,
      componentID: item.componentID,
      reviewSessionID: null,
      outcome: TaskRepetitionOutcome.Remembered,
      occurredAtTimestampMillis: now,
    },
  );
  const preview = getReviewIntervalAfterOutcome(
    item,
    policy,
    TaskRepetitionOutcome.Remembered,
    now,
  );
  expect(preview).toBe(expected.intervalMillis);
  expect(preview).not.toBe(expected.dueTimestampMillis);
  expect(preview).not.toBe(
    getReviewIntervalAfterOutcome(
      item,
      defaultOrbitSchedulerPolicy,
      TaskRepetitionOutcome.Remembered,
      now,
    ),
  );
});

test("a failed final card waits ten minutes before the app refills it", () => {
  const policy: FSRSSchedulerPolicy = {
    kind: "fsrs",
    version: 1,
    modelVersion: 6,
    weights: [...default_w],
    requestedRetention: 0.9,
    cutoverTimestampMillis: now,
    previousPolicy: defaultOrbitSchedulerPolicy,
  };
  const saved = createVaultSchedulerAdapter(policy).applyReview(
    item.task.componentStates.main,
    {
      kind: "review",
      taskID: item.task.id,
      componentID: item.componentID,
      reviewSessionID: null,
      outcome: TaskRepetitionOutcome.Forgotten,
      occurredAtTimestampMillis: now,
    },
  );
  const failed = {
    ...item,
    task: { ...item.task, componentStates: { main: saved } },
  };
  expect(itemIsStillDue(failed, now)).toBe(false);
  expect(itemIsStillDue(failed, now + 600_000 - 1)).toBe(false);
  expect(itemIsStillDue(failed, now + 600_000)).toBe(true);
  expect(
    [failed].filter((candidate) => itemIsStillDue(candidate, now)),
  ).toEqual([]);
  expect(itemIsStillDue(item, now)).toBe(true);
});

test.each([
  TaskRepetitionOutcome.Remembered,
  TaskRepetitionOutcome.Forgotten,
  TaskRepetitionOutcome.Skipped,
])(
  "the immediate %s preview uses the exact saved observation and FSRS policy",
  (outcome) => {
    const policy: FSRSSchedulerPolicy = {
      kind: "fsrs",
      version: 1,
      modelVersion: 6,
      weights: [...default_w],
      requestedRetention: 0.9,
      cutoverTimestampMillis: now,
      previousPolicy: defaultOrbitSchedulerPolicy,
    };
    const review: ReviewMutation = {
      kind: "recordReview",
      taskID: item.task.id,
      componentID: item.componentID,
      mutationID: "review/exact-mutation" as VaultMutationID,
      observationID: "review/exact-mutation" as ObservationID,
      reviewSessionID: "review/ios/exact-session",
      occurredAtTimestampMillis: now + 1234,
      outcome,
    };
    const expected = createVaultSchedulerAdapter(policy).applyReview(
      item.task.componentStates.main,
      { ...review, kind: "review" },
    );
    const task = getTaskAfterReview(item, policy, review);
    expect(task.componentStates.main).toEqual(expected);
    expect(task).not.toBe(item.task);
    expect(item.task.componentStates.main.dueTimestampMillis).toBe(
      now - 5 * day,
    );
    expect(task.componentStates.main.lastRepetitionTimestampMillis).toBe(
      outcome === TaskRepetitionOutcome.Skipped
        ? item.task.componentStates.main.lastRepetitionTimestampMillis
        : review.occurredAtTimestampMillis,
    );
  },
);

test("an immediate preview rejects a mismatched component instead of updating another task", () => {
  expect(() =>
    getTaskAfterReview(item, defaultOrbitSchedulerPolicy, {
      kind: "recordReview",
      taskID: item.task.id,
      componentID: "wrong",
      mutationID: "review/mismatch" as VaultMutationID,
      observationID: "review/mismatch" as ObservationID,
      reviewSessionID: null,
      occurredAtTimestampMillis: now,
      outcome: TaskRepetitionOutcome.Remembered,
    }),
  ).toThrow("does not match");
});
