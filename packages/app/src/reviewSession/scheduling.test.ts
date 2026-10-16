import {
  createVaultSchedulerAdapter,
  defaultOrbitSchedulerPolicy,
  TaskRepetitionOutcome,
  type FSRSSchedulerPolicy,
  type ReviewItem,
  type TaskID,
} from "@withorbit/core";
import { default_w } from "ts-fsrs";
import { expect, test } from "bun:test";
import { getReviewIntervalAfterOutcome, itemIsStillDue } from "./scheduling.js";

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
