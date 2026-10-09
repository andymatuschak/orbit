import type { ReviewItem, TaskID } from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import type { ReviewAreaItem } from "./ui/index.js";
import {
  reviewSessionManagerReconcileReviewQueue,
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
