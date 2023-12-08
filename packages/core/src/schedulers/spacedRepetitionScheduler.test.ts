import { TaskComponentState } from "../entities/task.js";
import { TaskRepetitionOutcome } from "../event.js";
import {
  createSpacedRepetitionScheduler,
  defaultSpacedRepetitionSchedulerConfiguration,
} from "./spacedRepetitionScheduler.js";

const scheduler = createSpacedRepetitionScheduler();

describe("first repetition", () => {
  const state: TaskComponentState = {
    createdAtTimestampMillis: 1000,
    lastRepetitionTimestampMillis: null,
    dueTimestampMillis: 1000,
    intervalMillis: 0,
  };

  test("remembered almost immediately", () => {
    const { dueTimestampMillis, intervalMillis } =
      scheduler.computeNextDueIntervalMillisForRepetition(
        state,
        2000,
        TaskRepetitionOutcome.Remembered,
      );

    expect(intervalMillis).toBe(
      defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval,
    );

    // Should be small, within jitter.
    expect(dueTimestampMillis - (2000 + intervalMillis)).toMatchInlineSnapshot(
      `0`,
    );
  });

  test("remembered with long delay", () => {
    const reviewTimestampMillis =
      state.dueTimestampMillis +
      defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval * 2;
    const { dueTimestampMillis, intervalMillis } =
      scheduler.computeNextDueIntervalMillisForRepetition(
        state,
        reviewTimestampMillis,
        TaskRepetitionOutcome.Remembered,
      );

    expect(intervalMillis).toBe(
      Math.floor(
        defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval *
          2 *
          defaultSpacedRepetitionSchedulerConfiguration.intervalGrowthFactor,
      ),
    );

    // Should be small, within jitter.
    expect(
      dueTimestampMillis - (reviewTimestampMillis + intervalMillis),
    ).toMatchInlineSnapshot(`0`);
  });

  test("skipped", () => {
    const { dueTimestampMillis, intervalMillis } =
      scheduler.computeNextDueIntervalMillisForRepetition(
        state,
        state.dueTimestampMillis,
        TaskRepetitionOutcome.Skipped,
      );

    expect(intervalMillis).toBe(
      Math.floor(
        defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval,
      ),
    );

    // Should be small, within jitter.
    expect(
      dueTimestampMillis - (state.dueTimestampMillis + intervalMillis),
    ).toMatchInlineSnapshot(`0`);
  });

  test("forgotten", () => {
    const reviewTimestampMillis = 10000;
    const { dueTimestampMillis, intervalMillis } =
      scheduler.computeNextDueIntervalMillisForRepetition(
        state,
        reviewTimestampMillis,
        TaskRepetitionOutcome.Forgotten,
      );

    expect(intervalMillis).toBe(0);
    // Should be roughly ten minutes.
    expect(dueTimestampMillis - reviewTimestampMillis).toMatchInlineSnapshot(
      `600000`,
    );
  });
});

const testState: TaskComponentState = {
  createdAtTimestampMillis: 0,
  lastRepetitionTimestampMillis: 1000,
  dueTimestampMillis:
    defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval * 2,
  intervalMillis:
    defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval * 2,
};

describe.each([
  { outcome: TaskRepetitionOutcome.Remembered, label: "successful" },
  { outcome: TaskRepetitionOutcome.Skipped, label: "skipped" },
])("$label repetition", ({ outcome }) => {
  test("typical repetition", () => {
    const reviewTimestampMillis = testState.dueTimestampMillis + 100000;
    const { dueTimestampMillis, intervalMillis } =
      scheduler.computeNextDueIntervalMillisForRepetition(
        testState,
        reviewTimestampMillis,
        outcome,
      );

    // Interval should grow by a little more than growth rate (because we remembered for a bit longer than requested).
    expect(
      intervalMillis /
        (testState.intervalMillis *
          defaultSpacedRepetitionSchedulerConfiguration.intervalGrowthFactor),
    ).toBeCloseTo(1);

    // Should be within jitter.
    expect(
      dueTimestampMillis - (reviewTimestampMillis + intervalMillis),
    ).toMatchInlineSnapshot(`0`);
  });

  test("very delayed repetition", () => {
    const reviewTimestampMillis =
      testState.dueTimestampMillis + testState.intervalMillis;
    const { dueTimestampMillis, intervalMillis } =
      scheduler.computeNextDueIntervalMillisForRepetition(
        testState,
        reviewTimestampMillis,
        outcome,
      );

    // Interval should grow by roughly double the normal more than growth rate (because we remembered for around twice as long as requested)
    expect(
      intervalMillis /
        testState.intervalMillis /
        defaultSpacedRepetitionSchedulerConfiguration.intervalGrowthFactor,
    ).toBeCloseTo(2);

    // Should be within jitter.
    expect(
      dueTimestampMillis - (reviewTimestampMillis + intervalMillis),
    ).toMatchInlineSnapshot(`0`);
  });

  test("too-early repetition", () => {
    const reviewTimestampMillis =
      testState.lastRepetitionTimestampMillis! + testState.intervalMillis / 2.0;
    const { dueTimestampMillis, intervalMillis } =
      scheduler.computeNextDueIntervalMillisForRepetition(
        testState,
        reviewTimestampMillis,
        TaskRepetitionOutcome.Remembered,
      );

    // The interval should still grow, but less than usual.
    expect(intervalMillis / testState.intervalMillis).toBeGreaterThan(1);
    expect(
      intervalMillis /
        testState.intervalMillis /
        defaultSpacedRepetitionSchedulerConfiguration.intervalGrowthFactor,
    ).toBeCloseTo(0.5); // i.e. half as much growth as usual

    // Should be within jitter.
    expect(
      dueTimestampMillis - (reviewTimestampMillis + intervalMillis),
    ).toMatchInlineSnapshot(`0`);
  });
});

test.each([
  // Forgetting doesn't penalize "extra" or less if you reviewed with a very different timeframe.
  {
    reviewTimestampMillis: testState.dueTimestampMillis + 100000,
    label: "typical",
  },
  {
    reviewTimestampMillis:
      testState.dueTimestampMillis + testState.intervalMillis / 2,
    label: "early",
  },
  {
    reviewTimestampMillis:
      testState.dueTimestampMillis + testState.intervalMillis * 2,
    label: "late",
  },
])("forgotten repetition: $label", ({ reviewTimestampMillis }) => {
  const { dueTimestampMillis, intervalMillis } =
    scheduler.computeNextDueIntervalMillisForRepetition(
      testState,
      reviewTimestampMillis,
      TaskRepetitionOutcome.Forgotten,
    );

  // Interval should shrink.
  expect(intervalMillis).toBeLessThan(testState.intervalMillis);

  // Should be within jitter.
  expect(dueTimestampMillis - reviewTimestampMillis).toMatchInlineSnapshot(
    `600000`,
  );
});

describe.each([
  { outcome: TaskRepetitionOutcome.Remembered, label: "successful" },
  { outcome: TaskRepetitionOutcome.Skipped, label: "skipped" },
])("$label after retry", ({ outcome }) => {
  test("not yet successful", () => {
    const reviewTimestampMillis = 10000;
    const { dueTimestampMillis, intervalMillis } =
      scheduler.computeNextDueIntervalMillisForRepetition(
        {
          createdAtTimestampMillis: 0,
          lastRepetitionTimestampMillis: 1000,
          dueTimestampMillis: 1000,
          intervalMillis: 0,
        },
        reviewTimestampMillis,
        outcome,
      );

    // After a successful initial retry, the interval should jump from 0 to the initial interval.
    expect(intervalMillis).toEqual(
      defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval,
    );

    // Should be within jitter.
    expect(
      dueTimestampMillis - (reviewTimestampMillis + intervalMillis),
    ).toMatchInlineSnapshot(`0`);
  });

  test("with past success", () => {
    const lastRepetitionTimestampMillis =
      defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval * 4;
    const reviewTimestampMillis = lastRepetitionTimestampMillis + 10000;
    const { dueTimestampMillis, intervalMillis } =
      scheduler.computeNextDueIntervalMillisForRepetition(
        {
          createdAtTimestampMillis: 0,
          lastRepetitionTimestampMillis,
          dueTimestampMillis: lastRepetitionTimestampMillis,
          intervalMillis:
            defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval *
            2,
        },
        reviewTimestampMillis,
        outcome,
      );

    // The interval shouldn't grow.
    expect(intervalMillis).toEqual(
      defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval * 2,
    );

    // Should be within jitter.
    expect(
      dueTimestampMillis - (reviewTimestampMillis + intervalMillis),
    ).toMatchInlineSnapshot(`0`);
  });

  test("very delayed, with past success", () => {
    const lastRepetitionTimestampMillis =
      defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval * 4;
    const reviewTimestampMillis =
      lastRepetitionTimestampMillis +
      defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval * 4;
    const { dueTimestampMillis, intervalMillis } =
      scheduler.computeNextDueIntervalMillisForRepetition(
        {
          createdAtTimestampMillis: 0,
          lastRepetitionTimestampMillis,
          dueTimestampMillis: lastRepetitionTimestampMillis,
          intervalMillis:
            defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval *
            2,
        },
        reviewTimestampMillis,
        outcome,
      );

    // Because they waited so long, and still rememberd, the interval should grow.
    expect(intervalMillis).toBeGreaterThan(
      defaultSpacedRepetitionSchedulerConfiguration.initialReviewInterval * 2,
    );

    // Should be within jitter.
    expect(
      dueTimestampMillis - (reviewTimestampMillis + intervalMillis),
    ).toMatchInlineSnapshot(`0`);
  });
});
