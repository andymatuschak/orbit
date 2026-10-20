import {
  defaultOrbitSchedulerPolicy,
  TaskRepetitionOutcome,
  type FSRSSchedulerPolicy,
  type ObservationID,
  type ReviewItem,
  type TaskID,
  type VaultMutationID,
} from "@withorbit/core";
import { expect, test } from "bun:test";
import { default_w } from "ts-fsrs";
import {
  reviewSessionManagerMarkCurrentItem,
  reviewSessionManagerReconcileReviewQueue,
  reviewSessionManagerRefreshTask,
  type ReviewSessionManagerState,
} from "../reviewSessionManager.js";
import type { ReviewAreaItem } from "../ui/reviewAreaItem.js";
import { ReviewSubmission, type ReviewSaveState } from "./reviewSubmission.js";
import { getTaskAfterReview, type ReviewMutation } from "./scheduling.js";

test("advances immediately, rejects duplicate callbacks, and accepts the next review while saves are blocked", async () => {
  const items = [item("a"), item("b"), item("c")];
  let state = install(items);
  const first = deferred();
  const second = deferred();
  const writes: ReviewMutation[] = [];
  const reviewed = new Map<TaskID, ReviewItem["task"]>();
  const submission = new ReviewSubmission(
    () => {},
    (mutation) => {
      state = reviewSessionManagerRefreshTask(
        state,
        reviewed.get(mutation.taskID)!,
      );
    },
  );
  const save = (mutation: ReviewMutation) => {
    writes.push(mutation);
    return writes.length === 1 ? first.promise : second.promise;
  };
  const submit = (
    identity: string,
    reviewItem: ReviewItem,
    mutation: ReviewMutation,
  ) =>
    submission.submit(
      identity,
      mutation,
      () => {
        const preview = getTaskAfterReview(reviewItem, policy, mutation);
        reviewed.set(mutation.taskID, preview);
        state = reviewSessionManagerMarkCurrentItem(
          state,
          preview,
          mutation.componentID,
          now,
        );
      },
      save,
      () => {},
    );
  const a = review("a", 1);
  submission.showCard("0-a");
  const savingA = submit("0-a", items[0], a);
  expect(visible(state)).toBe("b");
  expect(submit("0-a", items[0], a)).toBeUndefined();
  expect(writes).toEqual([a]);

  // An old authoritative queue must not resurrect the optimistic completion.
  state = reviewSessionManagerReconcileReviewQueue(
    state,
    items,
    items.map(area),
  );
  expect(visible(state)).toBe("b");
  submission.showCard("1-b");
  expect(submit("0-a", items[0], a)).toBeUndefined();
  const b = review("b", 2);
  const savingB = submit("1-b", items[1], b);
  expect(visible(state)).toBe("c");
  expect(writes).toEqual([a, b]);

  // A queue arriving after only the first write still contains b as due.
  state = reviewSessionManagerReconcileReviewQueue(
    state,
    items.slice(1),
    items.slice(1).map(area),
  );
  expect(visible(state)).toBe("c");
  second.resolve();
  await savingB;
  first.resolve();
  await savingA;
  expect(visible(state)).toBe("c");
  expect(state.currentReviewAreaQueueIndex).toBe(2);
  expect(submission.hasUnsavedReviews).toBe(false);
});

test("a failed save exposes retry state, retains the exact command, and retries without another advance", async () => {
  const states: ReviewSaveState[] = [];
  const saved: ReviewMutation[] = [];
  const writes: ReviewMutation[] = [];
  const pendingAtSettlement: boolean[] = [];
  const submission = new ReviewSubmission(
    (state) => states.push(state),
    (mutation) => saved.push(mutation),
  );
  const mutation = review("a", 1);
  let advances = 0;
  submission.showCard("0-a");
  await submission.submit(
    "0-a",
    mutation,
    () => {
      advances++;
    },
    async (accepted) => {
      writes.push(accepted);
      throw new Error("disk temporarily unavailable");
    },
    () => pendingAtSettlement.push(submission.hasUnsavedReviews),
  );
  expect(states.at(-1)).toEqual({ failedCount: 1, isRetrying: false });
  expect(submission.hasUnsavedReviews).toBe(true);
  expect(submission.canSubmit("0-a")).toBe(false);

  const retry = deferred();
  const savingAgain = submission.retryFailed(
    async (accepted) => {
      writes.push(accepted);
      await retry.promise;
    },
    () => pendingAtSettlement.push(submission.hasUnsavedReviews),
  );
  await submission.retryFailed(
    async () => {
      throw new Error("duplicate retry");
    },
    () => {},
  );
  expect(states.at(-1)).toEqual({ failedCount: 1, isRetrying: true });
  expect(writes[1]).toBe(mutation);
  expect(writes[1].mutationID).toBe(writes[0].mutationID);
  expect(writes[1].observationID).toBe(writes[0].observationID);
  retry.resolve();
  await savingAgain;
  expect(advances).toBe(1);
  expect(saved).toEqual([mutation]);
  expect(states.at(-1)).toEqual({ failedCount: 0, isRetrying: false });
  expect(pendingAtSettlement).toEqual([true, false]);
  expect(submission.hasUnsavedReviews).toBe(false);
});

test("a completed save does not make a duplicate departing-card callback eligible again", async () => {
  const submission = new ReviewSubmission(
    () => {},
    () => {},
  );
  submission.showCard("0-a");
  await submission.submit(
    "0-a",
    review("a", 1),
    () => {},
    async () => {},
    () => {},
  );
  expect(submission.canSubmit("0-a")).toBe(false);
  submission.showCard("1-b");
  expect(submission.canSubmit("0-a")).toBe(false);
  expect(submission.canSubmit("1-b")).toBe(true);
});

test("a newer review of the same task invalidates an older saved-task refresh", async () => {
  const oldRead = deferred();
  const secondSave = deferred();
  const applied: ReviewMutation[] = [];
  let refresh!: Promise<void>;
  const submission = new ReviewSubmission(
    () => {},
    (mutation) => {
      const version = submission.savedTaskVersion(mutation.taskID);
      refresh = oldRead.promise.then(() => {
        if (
          version !== undefined &&
          submission.savedTaskVersion(mutation.taskID) === version
        )
          applied.push(mutation);
      });
    },
  );
  const first = review("a", 1);
  const second = { ...review("a", 2), componentID: "other" };
  submission.showCard("0-a-main");
  await submission.submit(
    "0-a-main",
    first,
    () => {},
    async () => {},
    () => {},
  );
  const staleRefresh = refresh;
  submission.showCard("1-a-other");
  const saving = submission.submit(
    "1-a-other",
    second,
    () => {},
    () => secondSave.promise,
    () => {},
  );
  oldRead.resolve();
  await staleRefresh;
  expect(applied).toEqual([]);
  secondSave.resolve();
  await saving;
  await refresh;
  expect(applied).toEqual([second]);
});

test("canonical refresh waits for failed same-task reviews and resumes when an older retry finishes last", async () => {
  const versions: (VaultMutationID | undefined)[] = [];
  const submission = new ReviewSubmission(
    () => {},
    (mutation) => {
      versions.push(submission.savedTaskVersion(mutation.taskID));
    },
  );
  const first = review("a", 1);
  const second = { ...review("a", 2), componentID: "other" };
  submission.showCard("0-a-main");
  await submission.submit(
    "0-a-main",
    first,
    () => {},
    async () => {
      throw new Error("temporary save failure");
    },
    () => {},
  );
  submission.showCard("1-a-other");
  await submission.submit(
    "1-a-other",
    second,
    () => {},
    async () => {},
    () => {},
  );
  expect(versions).toEqual([undefined]);
  await submission.retryFailed(
    async () => {},
    () => {},
  );
  expect(versions).toEqual([undefined, second.mutationID]);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const now = Date.UTC(2026, 9, 20);
const policy: FSRSSchedulerPolicy = {
  kind: "fsrs",
  version: 1,
  modelVersion: 6,
  weights: [...default_w],
  requestedRetention: 0.9,
  cutoverTimestampMillis: now,
  previousPolicy: defaultOrbitSchedulerPolicy,
};
function review(taskID: string, number: number): ReviewMutation {
  return {
    kind: "recordReview",
    taskID: taskID as TaskID,
    componentID: "main",
    mutationID: `review/${number}` as VaultMutationID,
    observationID: `review/${number}` as ObservationID,
    reviewSessionID: "review/ios/test",
    occurredAtTimestampMillis: now + number,
    outcome: TaskRepetitionOutcome.Remembered,
  };
}
function item(id: string): ReviewItem {
  return {
    task: {
      id,
      spec: { text: id },
      provenance: null,
      componentStates: {
        main: {
          createdAtTimestampMillis: now - 86400000,
          dueTimestampMillis: now - 1,
          intervalMillis: 0,
          lastRepetitionTimestampMillis: null,
        },
      },
    },
    componentID: "main",
  } as unknown as ReviewItem;
}
function area(reviewItem: ReviewItem): ReviewAreaItem {
  return {
    taskID: reviewItem.task.id,
    componentID: reviewItem.componentID,
    spec: reviewItem.task.spec,
  } as ReviewAreaItem;
}
function install(items: ReviewItem[]): ReviewSessionManagerState {
  return reviewSessionManagerReconcileReviewQueue(
    {
      sessionItems: [],
      reviewAreaQueue: [],
      currentSessionItemIndex: null,
      currentReviewAreaQueueIndex: null,
      topUndoItem: null,
    },
    items,
    items.map(area),
  );
}
function visible(state: ReviewSessionManagerState): string | undefined {
  return state.reviewAreaQueue[state.currentReviewAreaQueueIndex!]?.taskID;
}
