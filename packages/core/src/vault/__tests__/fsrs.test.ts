import { expect, test } from "bun:test";
import { dateDiffInDays, default_w, fsrs, Rating } from "ts-fsrs";
import {
  createVaultSchedulerAdapter,
  createReviewQueue,
  defaultOrbitSchedulerPolicy,
  projectResolvedVault,
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  type FSRSSchedulerPolicy,
  type ObservationID,
  type ReviewObservation,
  type SchedulingObservation,
  type TaskID,
  type VaultTask,
} from "../../index.js";

const day = 86_400_000;
const cutover = Date.parse("2026-10-14T00:00:00Z");
const taskID = "task-fsrs-test" as TaskID;
const policy: FSRSSchedulerPolicy = {
  kind: "fsrs",
  version: 1,
  modelVersion: 6,
  weights: [...default_w],
  requestedRetention: 0.9,
  cutoverTimestampMillis: cutover,
  previousPolicy: defaultOrbitSchedulerPolicy,
};
const algorithm = fsrs({
  w: policy.weights,
  request_retention: policy.requestedRetention,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: [],
  relearning_steps: [],
});
const task: VaultTask = {
  createdAtTimestampMillis: cutover - 30 * day,
  spec: {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Plain,
      body: { text: "Test", attachments: [] },
    },
  },
  provenance: null,
  metadata: {},
  isDeleted: false,
};

test("runtime retains valid FSRS-6 weights exactly and rejects silent parameter clipping", () => {
  expect(algorithm.parameters.w).toEqual(policy.weights);
  expect(() =>
    createVaultSchedulerAdapter({
      ...policy,
      weights: [...policy.weights.slice(0, 20), 0.9],
    }),
  ).toThrow("weights out of bounds");
});

function review(
  timestamp: number,
  outcome = TaskRepetitionOutcome.Remembered,
  componentID = "main",
): ReviewObservation {
  return {
    kind: "review",
    taskID,
    componentID,
    occurredAtTimestampMillis: timestamp,
    outcome,
    reviewSessionID: "test-session",
  };
}

function project(
  observations: [string, SchedulingObservation][],
  scheduler = policy,
  definition = task,
) {
  return projectResolvedVault({
    policy: scheduler,
    resolvedTasks: new Map([[taskID, definition]]),
    observations: observations as [ObservationID, SchedulingObservation][],
  }).tasks.get(taskID)!;
}

test("FSRS-6 uses Good for remembered, Again for forgotten, and Orbit's ten-minute retry", () => {
  const adapter = createVaultSchedulerAdapter(policy);
  const first = adapter.applyReview(
    adapter.initialize(cutover),
    review(cutover),
  );
  const initial = algorithm.next_state(null, 0, Rating.Good);
  expect(first.fsrs).toEqual({
    ...initial,
    lastReviewTimestampMillis: cutover,
  });
  expect(first.intervalMillis).toBe(
    algorithm.next_interval(initial.stability, 0) * day,
  );
  expect(first.dueTimestampMillis).toBe(cutover + first.intervalMillis);

  const timestamp = cutover + 15 * day;
  const forgotten = adapter.applyReview(
    first,
    review(timestamp, TaskRepetitionOutcome.Forgotten),
  );
  const failed = algorithm.next_state(initial, 15, Rating.Again);
  expect(forgotten.fsrs).toEqual({
    ...failed,
    lastReviewTimestampMillis: timestamp,
    isRetry: true,
  });
  expect(forgotten.intervalMillis).toBe(
    algorithm.next_interval(failed.stability, 15) * day,
  );
  expect(forgotten.dueTimestampMillis).toBe(timestamp + 600_000);

  const remembered = adapter.applyReview(
    forgotten,
    review(timestamp + 600_000),
  );
  expect(remembered.fsrs?.isRetry).toBeUndefined();
});

test("history warms memory without changing any pre-cutover scheduling result", () => {
  const history: [string, SchedulingObservation][] = [
    ["one", review(cutover - 20 * day)],
    ["two", review(cutover - 15 * day, TaskRepetitionOutcome.Forgotten)],
    ["three", review(cutover - 15 * day + 700_123)],
    ["four", review(cutover - 10 * day, TaskRepetitionOutcome.Skipped)],
    [
      "five",
      {
        kind: "reschedule",
        taskID,
        componentID: "main",
        occurredAtTimestampMillis: cutover - day,
        newDueTimestampMillis: cutover + 40 * day,
      },
    ],
  ];
  for (let count = 0; count <= history.length; count++) {
    const observations = history.slice(0, count) as [
      ObservationID,
      SchedulingObservation,
    ][];
    const original = projectResolvedVault({
      policy: defaultOrbitSchedulerPolicy,
      resolvedTasks: new Map([[taskID, task]]),
      observations,
    }).tasks.get(taskID)!;
    const updated = project(history.slice(0, count));
    const { fsrs: memory, ...schedule } = updated.componentStates.main;
    expect(schedule).toEqual(original.componentStates.main);
    if (count > 0) expect(memory).toBeDefined();
  }
  const before = project(history).componentStates.main;
  const next = project([...history, ["cutover", review(cutover)]])
    .componentStates.main;
  const expected = algorithm.next_state(before.fsrs!, 15, Rating.Good);
  expect(next.fsrs).toEqual({
    ...expected,
    lastReviewTimestampMillis: cutover,
  });
  expect(next.dueTimestampMillis).toBe(
    cutover + algorithm.next_interval(expected.stability, 15) * day,
  );
});

test("historical Forgotten stays ordinary backlog; only FSRS-era Forgotten enters retry lane", () => {
  const historical = project([
    [
      "old-failure",
      review(cutover - 20 * day, TaskRepetitionOutcome.Forgotten),
    ],
  ]);
  expect(historical.componentStates.main.fsrs?.isRetry).toBeUndefined();
  const adapter = createVaultSchedulerAdapter(defaultOrbitSchedulerPolicy);
  const previous = adapter.applyReview(
    adapter.initialize(task.createdAtTimestampMillis),
    review(cutover - 20 * day, TaskRepetitionOutcome.Forgotten),
  );
  const { fsrs: _memory, ...schedule } = historical.componentStates.main;
  expect(schedule).toEqual(previous);

  const retry = {
    ...project([
      ["new-failure", review(cutover, TaskRepetitionOutcome.Forgotten)],
    ]),
    id: "fsrs-retry" as TaskID,
  };
  expect(retry.componentStates.main.fsrs?.isRetry).toBeTrue();
  const highRecall = {
    ...project([["new-success", review(cutover)]]),
    id: "high-recall" as TaskID,
  };
  highRecall.componentStates.main.dueTimestampMillis = cutover - day;
  const now = cutover + 600_000;
  expect(
    createReviewQueue([historical, highRecall, retry], 3, {
      scheduler: policy,
      nowTimestampMillis: now,
    }).map(({ task }) => task.id),
  ).toEqual([retry.id, highRecall.id, historical.id]);
  expect(
    createReviewQueue([historical, highRecall, retry], 3, {
      scheduler: policy,
      nowTimestampMillis: now - 1,
    }).map(({ task }) => task.id),
  ).toEqual([highRecall.id, historical.id]);
});

test("UTC calendar days distinguish same-day learning from a midnight boundary", () => {
  const adapter = createVaultSchedulerAdapter(policy);
  const start = cutover + 23 * 3_600_000 + 59 * 60_000;
  const first = adapter.applyReview(adapter.initialize(start), review(start));
  for (const timestamp of [start + 30_000, start + 120_000]) {
    const elapsed = dateDiffInDays(new Date(start), new Date(timestamp));
    const next = adapter.applyReview(first, review(timestamp));
    expect(next.fsrs).toEqual({
      ...algorithm.next_state(first.fsrs!, elapsed, Rating.Good),
      lastReviewTimestampMillis: timestamp,
    });
    expect(elapsed).toBe(timestamp === start + 30_000 ? 0 : 1);
  }
});

test("skip defers one day without a recall; reschedule changes only due", () => {
  const adapter = createVaultSchedulerAdapter(policy);
  const first = adapter.applyReview(
    adapter.initialize(cutover),
    review(cutover),
  );
  const skippedAt = cutover + day;
  const skipped = adapter.applyReview(
    first,
    review(skippedAt, TaskRepetitionOutcome.Skipped),
  );
  expect(skipped).toEqual({ ...first, dueTimestampMillis: skippedAt + day });
  const rescheduled = adapter.applyReschedule(skipped, {
    kind: "reschedule",
    taskID,
    componentID: "main",
    occurredAtTimestampMillis: skippedAt + 1,
    newDueTimestampMillis: skippedAt + 10 * day,
  });
  expect(rescheduled).toEqual({
    ...skipped,
    dueTimestampMillis: skippedAt + 10 * day,
  });
  expect(
    adapter.applyReview(
      adapter.initialize(cutover),
      review(cutover, TaskRepetitionOutcome.Skipped),
    ),
  ).toEqual({
    createdAtTimestampMillis: cutover,
    lastRepetitionTimestampMillis: null,
    intervalMillis: 0,
    dueTimestampMillis: cutover + day,
  });

  const forgotten = adapter.applyReview(
    first,
    review(cutover + day, TaskRepetitionOutcome.Forgotten),
  );
  expect(
    adapter.applyReview(
      forgotten,
      review(cutover + 2 * day, TaskRepetitionOutcome.Skipped),
    ).fsrs,
  ).toEqual(forgotten.fsrs);
  expect(
    adapter.applyReschedule(forgotten, {
      kind: "reschedule",
      taskID,
      componentID: "main",
      occurredAtTimestampMillis: cutover + 2 * day,
      newDueTimestampMillis: cutover + 3 * day,
    }).fsrs,
  ).toEqual(forgotten.fsrs);
});

test("cloze components fold independently", () => {
  const cloze: VaultTask = {
    ...task,
    spec: {
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.Cloze,
        body: { text: "a b", attachments: [] },
        components: {
          a: { order: 0, ranges: [] },
          b: { order: 1, ranges: [] },
        },
      },
    },
  };
  const projected = project(
    [
      ["a1", review(cutover, TaskRepetitionOutcome.Remembered, "a")],
      ["a2", review(cutover + 5 * day, TaskRepetitionOutcome.Remembered, "a")],
      ["b", review(cutover + 7 * day, TaskRepetitionOutcome.Forgotten, "b")],
    ],
    policy,
    cloze,
  );
  expect(projected.componentStates.a.fsrs?.lastReviewTimestampMillis).toBe(
    cutover + 5 * day,
  );
  expect(projected.componentStates.b.fsrs).toEqual({
    ...algorithm.next_state(null, 0, Rating.Again),
    lastReviewTimestampMillis: cutover + 7 * day,
    isRetry: true,
  });
});

test("duplicate legacy IDs warm memory once but preserve historical due; distinct same-time recalls remain distinct", () => {
  const observation = review(cutover - 10 * day);
  const observations: [string, SchedulingObservation][] = [
    ["legacy/event", observation],
    ["legacy/17/event", { ...observation }],
  ];
  const original = projectResolvedVault({
    policy: defaultOrbitSchedulerPolicy,
    resolvedTasks: new Map([[taskID, task]]),
    observations: observations as [ObservationID, SchedulingObservation][],
  }).tasks.get(taskID)!;
  const { fsrs: memory, ...schedule } =
    project(observations).componentStates.main;
  expect(schedule).toEqual(original.componentStates.main);
  expect(memory).toEqual({
    ...algorithm.next_state(null, 0, Rating.Good),
    lastReviewTimestampMillis: observation.occurredAtTimestampMillis,
  });
  const twice = algorithm.next_state(memory!, 0, Rating.Good);
  expect(
    project([
      ["one", observation],
      ["two", observation],
    ]).componentStates.main.fsrs,
  ).toEqual({
    ...twice,
    lastReviewTimestampMillis: observation.occurredAtTimestampMillis,
  });
  expect(
    project([
      ["legacy/event", observation],
      ["legacy/17/event", { ...observation, reviewSessionID: "different" }],
    ]).componentStates.main.fsrs,
  ).toEqual({
    ...twice,
    lastReviewTimestampMillis: observation.occurredAtTimestampMillis,
  });
});

test("projection has deterministic ordering and no random interval fuzz", () => {
  const observations: [string, SchedulingObservation][] = [
    ["c", review(cutover + 20 * day)],
    ["a", review(cutover)],
    ["b", review(cutover + 5 * day, TaskRepetitionOutcome.Forgotten)],
    ["b-2", review(cutover + 5 * day)],
  ];
  const expected = project(observations);
  for (let count = 0; count < 20; count++) {
    expect(project([...observations].reverse())).toEqual(expected);
  }
});
