import { expect, test, describe } from "bun:test";
import { default_w } from "ts-fsrs";
import { Task, TaskID } from "./entities/task.js";
import { testClozeTask } from "./__tests__/testTasks.js";
import {
  createReviewQueue,
  selectReviewCandidates,
  type ReviewCandidatePriority,
} from "./reviewQueue.js";
import {
  defaultOrbitSchedulerPolicy,
  type FSRSSchedulerPolicy,
} from "./vault/schema.js";

const day = 86_400_000;
const now = Date.parse("2026-10-15T12:00:00Z");
const scheduler: FSRSSchedulerPolicy = {
  kind: "fsrs",
  version: 1,
  modelVersion: 6,
  weights: [...default_w],
  requestedRetention: 0.9,
  cutoverTimestampMillis: now - day,
  previousPolicy: defaultOrbitSchedulerPolicy,
};

function candidate(
  id: string,
  dueDaysAgo: number,
  stability?: number,
  isRetry?: true,
): ReviewCandidatePriority {
  return {
    id,
    dueTimestampMillis: now - dueDaysAgo * day,
    memory:
      stability === undefined
        ? undefined
        : {
            stability,
            lastReviewTimestampMillis: now - day,
            ...(isRetry ? { isRetry } : {}),
          },
  };
}

function select(
  candidates: ReviewCandidatePriority[],
  maximumCount = 50,
  reviewCount = 0,
) {
  return selectReviewCandidates(candidates, (value) => value, {
    scheduler,
    nowTimestampMillis: now,
    maximumCount,
    reviewCount,
  }).map(({ id }) => id);
}

describe("mixed FSRS backlog selection", () => {
  const backlog = [
    candidate("old-1", 100, 1),
    candidate("old-2", 90, 2),
    candidate("old-3", 80, 3),
    candidate("high-1", 10, 1_000),
    candidate("high-2", 9, 500),
    candidate("high-3", 8, 250),
  ];

  test("interleaves highest recall and oldest due across the whole backlog before capping", () => {
    expect(select(backlog, 6)).toEqual([
      "high-1",
      "old-1",
      "high-2",
      "old-2",
      "high-3",
      "old-3",
    ]);
    expect(select(backlog, 3)).toEqual(["high-1", "old-1", "high-2"]);
    expect(select(backlog, 1)).toEqual(["high-1"]);
    expect(select(backlog, 0)).toEqual([]);
  });

  test("saved-review parity prevents a rebuilt queue from always starting with high recall", () => {
    expect(select(backlog, 3, 1)).toEqual(["old-1", "high-1", "old-2"]);
    let remaining = [...backlog];
    const firsts: string[] = [];
    for (let reviewCount = 0; remaining.length; reviewCount++) {
      const [next] = select(remaining, 50, reviewCount);
      firsts.push(next);
      remaining = remaining.filter(({ id }) => id !== next);
    }
    expect(firsts).toEqual(select(backlog));
  });

  test("only due retries precede the mixture; fuzzy lookahead never shortens a retry", () => {
    const inputs = [
      ...backlog,
      candidate("retry-later", -1 / 24, 100, true),
      candidate("retry-now", 0, 100, true),
      candidate("retry-older", 1, 100, true),
    ];
    expect(select(inputs, 4)).toEqual([
      "retry-older",
      "retry-now",
      "high-1",
      "old-1",
    ]);
    expect(select(inputs, 1)).toEqual(["retry-older"]);
    expect(select(inputs)).not.toContain("retry-later");
  });

  test("unscored cards enter the oldest-due lane and exhausted lanes fill remaining places", () => {
    const unknown = [
      candidate("unknown-older", 100),
      candidate("unknown-newer", 90),
    ];
    expect(select([...unknown, candidate("known", 1, 100)], 3)).toEqual([
      "known",
      "unknown-older",
      "unknown-newer",
    ]);
    expect(select(unknown, 10)).toEqual(["unknown-older", "unknown-newer"]);
    expect(select(backlog, 10)).toHaveLength(backlog.length);
  });

  test("selection honors the existing sixteen-hour lookahead for non-retries", () => {
    expect(
      select([
        candidate("tomorrow", -1, 1_000),
        candidate("at-threshold", -16 / 24, 100),
        candidate("due-now", 0),
      ]),
    ).toEqual(["at-threshold", "due-now"]);
  });

  test("equal recall breaks ties by due time then ID, independent of input order", () => {
    const ties = [
      candidate("b", 1, 10),
      candidate("c", 2, 10),
      candidate("a", 1, 10),
    ];
    expect(select(ties)).toEqual(["c", "a", "b"]);
    expect(select([...ties].reverse())).toEqual(select(ties));
  });

  test("returns a task only once and uses its earliest supplied priority", () => {
    expect(
      select([
        candidate("same", 1, 100),
        candidate("other", 2),
        candidate("same", 3),
      ]),
    ).toEqual(["same", "other"]);
  });

  test("uses UTC calendar-day elapsed time and the configured FSRS weights", () => {
    const late = Date.parse("2026-10-15T23:59:00Z");
    const midnightBoundary = candidate("cross-midnight", 10, 1);
    midnightBoundary.memory!.lastReviewTimestampMillis = late;
    const sameDay = candidate("same-calendar-day", 1, 0.5);
    sameDay.memory!.lastReviewTimestampMillis = late + 120_000;
    const selected = selectReviewCandidates(
      [midnightBoundary, sameDay],
      (value) => value,
      {
        scheduler,
        nowTimestampMillis: late + 150_000,
        maximumCount: 1,
      },
    );
    expect(selected[0].id).toBe("same-calendar-day");
  });

  test("legacy selection still trusts the caller's date filter and stable equal-due ordering", () => {
    const inputs = [candidate("b", -2), candidate("a", -2), candidate("c", 1)];
    for (const policy of [undefined, defaultOrbitSchedulerPolicy]) {
      expect(
        selectReviewCandidates(inputs, (value) => value, {
          scheduler: policy,
          nowTimestampMillis: now,
          maximumCount: 3,
        }).map(({ id }) => id),
      ).toEqual(["c", "b", "a"]);
    }
  });
});

describe("cloze task component ordering", () => {
  test("first due component chosen", () => {
    const testTask: Task = {
      ...testClozeTask,
      componentStates: {
        a: { ...testClozeTask.componentStates["a"], dueTimestampMillis: 5 },
        b: { ...testClozeTask.componentStates["b"], dueTimestampMillis: 0 },
      },
    };
    const queue = createReviewQueue([testTask]);
    expect(queue.length).toBe(1);
    expect(queue[0].componentID).toEqual("b");
  });

  test("ties broken by order number", () => {
    const queue = createReviewQueue([testClozeTask]);
    expect(queue.length).toBe(1);
    expect(queue[0].componentID).toEqual("a");
  });

  test("FSRS uses the earliest cloze component's memory and excludes deleted tasks", () => {
    const task: Task = {
      ...testClozeTask,
      componentStates: {
        a: {
          ...testClozeTask.componentStates.a,
          dueTimestampMillis: now - 10 * day,
          fsrs: {
            stability: 1,
            difficulty: 5,
            lastReviewTimestampMillis: now - day,
          },
        },
        b: {
          ...testClozeTask.componentStates.b,
          dueTimestampMillis: now - day,
          fsrs: {
            stability: 1_000,
            difficulty: 5,
            lastReviewTimestampMillis: now - day,
          },
        },
      },
    };
    const competitor: Task = {
      ...task,
      id: "competitor" as TaskID,
      componentStates: {
        ...task.componentStates,
        a: {
          ...task.componentStates.a,
          fsrs: { ...task.componentStates.a.fsrs!, stability: 10 },
        },
      },
    };
    const queue = createReviewQueue(
      [
        task,
        { ...competitor, id: "deleted" as TaskID, isDeleted: true },
        competitor,
      ],
      2,
      { scheduler, nowTimestampMillis: now },
    );
    expect(
      queue.map(({ task, componentID }) => [task.id, componentID]),
    ).toEqual([
      ["competitor", "a"],
      [task.id, "a"],
    ]);
  });
});
