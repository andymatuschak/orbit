import {
  getReviewQueueFuzzyDueTimestampThreshold,
  type ReviewItem,
  type Task,
  type TaskID,
} from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import type { ReviewAreaItem } from "./ui/index.js";
import {
  reviewSessionManagerReconcileReviewQueue,
  reviewSessionManagerMarkCurrentItem,
  reviewSessionManagerDeleteCurrentItem,
  reviewSessionManagerRefreshTask,
  type ReviewSessionManagerState,
} from "./reviewSessionManager.js";

describe("review queue reconciliation", () => {
  test("installs the first local queue", () => {
    const items = [reviewItem("a"), reviewItem("b")];
    const next = reviewSessionManagerReconcileReviewQueue(
      emptyState(),
      items,
      items.map(reviewAreaItem),
    );

    expect(next.sessionItems).toEqual(items);
    expect(next.reviewAreaQueue.map(({ taskID }) => String(taskID))).toEqual([
      "a",
      "b",
    ]);
    expect(next.currentReviewAreaQueueIndex).toBe(0);
    expect(next.currentSessionItemIndex).toBe(0);
  });

  test("keeps the visible prompt while replacing the unseen tail", () => {
    const visible = reviewItem("a", "local visible prompt");
    const removedRemote = reviewItem("b");
    const state = activeState([visible, removedRemote], 0);
    const remoteVisible = reviewItem("a", "remote replacement");
    const addedRemote = reviewItem("c");

    const next = reviewSessionManagerReconcileReviewQueue(
      state,
      [remoteVisible, addedRemote],
      [remoteVisible, addedRemote].map(reviewAreaItem),
    );

    expect(next.sessionItems[0]).toBe(visible);
    expect(next.reviewAreaQueue.map(({ taskID }) => String(taskID))).toEqual([
      "a",
      "c",
    ]);
    expect(next.currentReviewAreaQueueIndex).toBe(0);
    expect(next.currentSessionItemIndex).toBe(0);
  });

  test("advances when another client reviewed the visible prompt", () => {
    const reviewedElsewhere = reviewItem("a");
    const nextVisible = reviewItem("b");
    const state = activeState([reviewedElsewhere, nextVisible], 0);

    const next = reviewSessionManagerReconcileReviewQueue(
      state,
      [nextVisible],
      [reviewAreaItem(nextVisible)],
    );

    expect(next.sessionItems).toEqual([nextVisible]);
    expect(next.reviewAreaQueue.map(({ taskID }) => String(taskID))).toEqual([
      "b",
    ]);
    expect(next.currentReviewAreaQueueIndex).toBe(0);
    expect(next.currentSessionItemIndex).toBe(0);
  });

  test("finishes when another client reviewed the last visible prompt", () => {
    const reviewedElsewhere = reviewItem("a");
    const state = activeState([reviewedElsewhere], 0);

    const next = reviewSessionManagerReconcileReviewQueue(state, [], []);

    expect(next.sessionItems).toEqual([]);
    expect(next.reviewAreaQueue).toEqual([]);
    expect(next.currentReviewAreaQueueIndex).toBe(0);
    expect(next.currentSessionItemIndex).toBeNull();
  });

  test("starts newly merged work after the local queue was exhausted", () => {
    const completed = reviewItem("a");
    const state = activeState([completed], 1);
    const addedRemote = reviewItem("c");

    const next = reviewSessionManagerReconcileReviewQueue(
      state,
      [addedRemote],
      [reviewAreaItem(addedRemote)],
    );

    expect(next.reviewAreaQueue.map(({ taskID }) => String(taskID))).toEqual([
      "a",
      "c",
    ]);
    expect(next.currentReviewAreaQueueIndex).toBe(1);
    expect(next.currentSessionItemIndex).toBe(1);
  });
});

describe("deleting the current prompt", () => {
  test("deleting the only prompt leaves no invalid current item and preserves undo", () => {
    const state = activeState([reviewItem("a")], 0);
    const next = reviewSessionManagerDeleteCurrentItem(state);

    expect(next.sessionItems).toEqual([]);
    expect(next.reviewAreaQueue).toEqual([]);
    expect(next.currentReviewAreaQueueIndex).toBe(0);
    expect(next.currentSessionItemIndex).toBeNull();
    expect(next.topUndoItem?.previousState).toBe(state);
    expect(next.topUndoItem?.getUndoMutations()).toEqual([
      expect.objectContaining({
        kind: "setTaskDeleted",
        taskID: "a",
        isDeleted: false,
      }),
    ]);
  });

  test("deleting the last prompt keeps a valid remaining starburst item", () => {
    const state = activeState([reviewItem("a"), reviewItem("b")], 1);
    const next = reviewSessionManagerDeleteCurrentItem(state);

    expect(next.sessionItems.map(({ task }) => String(task.id))).toEqual(["a"]);
    expect(next.currentReviewAreaQueueIndex).toBe(1);
    expect(next.currentSessionItemIndex).toBe(0);
    expect(next.topUndoItem?.previousState).toBe(state);
  });

  test("deleting before the end advances to the next remaining prompt", () => {
    const state = activeState([reviewItem("a"), reviewItem("b")], 0);
    const next = reviewSessionManagerDeleteCurrentItem(state);

    expect(next.sessionItems.map(({ task }) => String(task.id))).toEqual(["b"]);
    expect(next.currentReviewAreaQueueIndex).toBe(0);
    expect(next.currentSessionItemIndex).toBe(0);
    expect(next.topUndoItem?.previousState).toBe(state);
  });
});

describe("saved review projection", () => {
  test("refreshes authoritative scheduling without advancing the successor", () => {
    const a = reviewItem("a");
    const b = reviewItem("b");
    const authoritative = {
      ...a.task,
      componentStates: {
        main: {
          createdAtTimestampMillis: 0,
          lastRepetitionTimestampMillis: 1000,
          intervalMillis: 86400000,
          dueTimestampMillis: Date.now() + 86400000,
        },
      },
    } satisfies Task;
    const state = activeState([a, b], 1);
    const refreshed = reviewSessionManagerRefreshTask(state, authoritative);
    expect(refreshed.sessionItems[0].task).toBe(authoritative);
    expect(refreshed.currentReviewAreaQueueIndex).toBe(1);
    expect(refreshed.currentSessionItemIndex).toBe(1);
    expect(refreshed.reviewAreaQueue).toBe(state.reviewAreaQueue);
  });

  test("installs the saved FSRS state before selecting items to retry", () => {
    const due = getReviewQueueFuzzyDueTimestampThreshold() - 1;
    const item = reviewItem("a");
    item.task.componentStates = {
      main: {
        createdAtTimestampMillis: 0,
        lastRepetitionTimestampMillis: null,
        intervalMillis: 0,
        dueTimestampMillis: due,
      },
    };
    const savedTask = {
      ...item.task,
      componentStates: {
        main: {
          ...item.task.componentStates.main,
          intervalMillis: 12 * 86_400_000,
          dueTimestampMillis: due + 12 * 86_400_000,
          fsrs: {
            stability: 12,
            difficulty: 4,
            lastReviewTimestampMillis: due,
          },
        },
      },
    } satisfies Task;
    const next = reviewSessionManagerMarkCurrentItem(
      activeState([item], 0),
      savedTask,
      "main",
    );

    expect(next.currentReviewAreaQueueIndex).toBe(1);
    expect(next.sessionItems[0].task).toBe(savedTask);
    expect(
      next.sessionItems.filter(
        (item) =>
          item.task.componentStates[item.componentID].dueTimestampMillis <=
          getReviewQueueFuzzyDueTimestampThreshold(),
      ),
    ).toEqual([]);
    expect(next.topUndoItem).toBeNull();
  });

  test("updates every session component belonging to the saved task", () => {
    const item = reviewItem("a");
    item.task.componentStates = {
      main: {
        createdAtTimestampMillis: 0,
        lastRepetitionTimestampMillis: null,
        intervalMillis: 0,
        dueTimestampMillis: 0,
      },
      other: {
        createdAtTimestampMillis: 0,
        lastRepetitionTimestampMillis: null,
        intervalMillis: 0,
        dueTimestampMillis: 0,
      },
    };
    const other = { ...item, componentID: "other" };
    const saved = { ...item.task };
    const next = reviewSessionManagerMarkCurrentItem(
      activeState([item, other], 0),
      saved,
      "main",
    );
    expect(next.sessionItems.every((item) => item.task === saved)).toBe(true);
    expect(next.currentSessionItemIndex).toBe(1);
  });

  test("does not skip the successor when the queue advanced during the projection read", () => {
    const reviewed = reviewItem("a");
    reviewed.task.componentStates = {
      main: {
        createdAtTimestampMillis: 0,
        lastRepetitionTimestampMillis: null,
        intervalMillis: 0,
        dueTimestampMillis: 0,
      },
      other: {
        createdAtTimestampMillis: 0,
        lastRepetitionTimestampMillis: null,
        intervalMillis: 0,
        dueTimestampMillis: 0,
      },
    };
    for (const successor of [
      reviewItem("b"),
      { ...reviewed, componentID: "other" },
    ]) {
      const state = activeState([successor], 0);
      const next = reviewSessionManagerMarkCurrentItem(
        state,
        reviewed.task,
        "main",
      );
      expect(next.currentReviewAreaQueueIndex).toBe(0);
      expect(next.currentSessionItemIndex).toBe(0);
      expect(next.sessionItems[0].componentID).toBe(successor.componentID);
    }
    expect(
      reviewSessionManagerMarkCurrentItem(emptyState(), reviewed.task, "main"),
    ).toEqual(emptyState());
  });

  test.each(["main", "__proto__", "constructor", "toString"])(
    "rejects a saved task missing its own reviewed component: %s",
    (componentID) => {
      const item = reviewItem("a");
      item.componentID = componentID;
      const state = activeState([item], 0);
      expect(() =>
        reviewSessionManagerMarkCurrentItem(
          state,
          {
            ...item.task,
            componentStates: {},
          },
          componentID,
        ),
      ).toThrow("missing the current component");
    },
  );

  test("refills an exhausted queue in the same repeatable state transition", () => {
    const now = Date.UTC(2026, 9, 15);
    const item = reviewItem("a");
    const saved = {
      ...item.task,
      componentStates: {
        main: {
          createdAtTimestampMillis: 0,
          lastRepetitionTimestampMillis: now,
          intervalMillis: 0,
          dueTimestampMillis: now,
        },
      },
    } satisfies Task;
    const state = activeState([item], 0);
    const mark = () =>
      reviewSessionManagerMarkCurrentItem(state, saved, "main", now);

    expect(mark()).toEqual(mark());
    expect(state.reviewAreaQueue).toHaveLength(1);
    const next = mark();
    expect(next.currentReviewAreaQueueIndex).toBe(1);
    expect(next.currentSessionItemIndex).toBe(0);
    expect(next.reviewAreaQueue).toEqual([
      state.reviewAreaQueue[0],
      state.reviewAreaQueue[0],
    ]);
    expect(next.sessionItems[0].task).toBe(saved);
  });

  test("does not immediately refill an FSRS retry that is not due yet", () => {
    const now = Date.UTC(2026, 9, 15);
    const item = reviewItem("a");
    const saved = {
      ...item.task,
      componentStates: {
        main: {
          createdAtTimestampMillis: 0,
          lastRepetitionTimestampMillis: now,
          intervalMillis: 9 * 86_400_000,
          dueTimestampMillis: now + 600_000,
          fsrs: {
            stability: 9,
            difficulty: 4,
            lastReviewTimestampMillis: now,
            isRetry: true,
          },
        },
      },
    } satisfies Task;
    const next = reviewSessionManagerMarkCurrentItem(
      activeState([item], 0),
      saved,
      "main",
      now,
    );
    expect(next.reviewAreaQueue).toHaveLength(1);
    expect(next.currentReviewAreaQueueIndex).toBe(1);
  });
});

function emptyState(): ReviewSessionManagerState {
  return {
    reviewAreaQueue: [],
    currentReviewAreaQueueIndex: null,
    sessionItems: [],
    currentSessionItemIndex: null,
    topUndoItem: null,
  };
}

function activeState(
  items: ReviewItem[],
  currentReviewAreaQueueIndex: number,
): ReviewSessionManagerState {
  return {
    reviewAreaQueue: items.map(reviewAreaItem),
    currentReviewAreaQueueIndex,
    sessionItems: items,
    currentSessionItemIndex:
      currentReviewAreaQueueIndex < items.length
        ? currentReviewAreaQueueIndex
        : items.length - 1,
    topUndoItem: null,
  };
}

function reviewItem(id: string, text = id): ReviewItem {
  return {
    task: {
      id: id as TaskID,
      spec: { text },
      provenance: null,
    },
    componentID: "main",
  } as unknown as ReviewItem;
}

function reviewAreaItem(item: ReviewItem): ReviewAreaItem {
  return {
    taskID: item.task.id,
    spec: item.task.spec,
    componentID: item.componentID,
    provenance: item.task.provenance,
    colorPalette: {},
  } as ReviewAreaItem;
}
