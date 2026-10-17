import {
  generateUniqueID,
  ReviewItem,
  Task,
  type VaultMutation,
  type VaultMutationID,
} from "@withorbit/core";
import { ReviewAreaItem } from "./ui/index.js";
import { useMemo, useState } from "react";
import { itemIsStillDue } from "./reviewSession/scheduling.js";

export interface ReviewSessionManagerState {
  reviewAreaQueue: ReviewAreaItem[];
  currentReviewAreaQueueIndex: number | null;

  sessionItems: ReviewItem[];
  currentSessionItemIndex: number | null;

  topUndoItem: ReviewSessionManagerUndoStackItem | null;
}

export interface ReviewSessionManagerActions {
  markCurrentItem(savedTask: Task, reviewedComponentID: string): void;

  reconcileReviewQueue(
    reviewItems: ReviewItem[],
    reviewAreaItems: ReviewAreaItem[],
  ): void;

  undo(): void;

  deleteCurrentItem(): void;

  jumpToItem(sessionItemIndex: number): void;
}

function findSessionItemIndex(
  reviewAreaItem: ReviewAreaItem,
  sessionItems: ReviewItem[],
): number {
  const index = sessionItems.findIndex(
    (sessionItem) =>
      sessionItem.task.id === reviewAreaItem.taskID &&
      sessionItem.componentID === reviewAreaItem.componentID,
  );

  if (index === -1) {
    throw new Error(
      `Cannot find review area item ${JSON.stringify(
        reviewAreaItem,
        null,
        "\t",
      )} in session items ${JSON.stringify(sessionItems, null, "\t")}`,
    );
  } else {
    return index;
  }
}

export function reviewSessionManagerMarkCurrentItem(
  state: ReviewSessionManagerState,
  savedTask: Task,
  reviewedComponentID: string,
  nowTimestampMillis = Date.now(),
): ReviewSessionManagerState {
  if (!Object.hasOwn(savedTask.componentStates, reviewedComponentID))
    throw new Error("Saved review task is missing the current component");

  // Use the vault's actual projection, including its selected scheduler and
  // concurrent observations. Retry selection must not use a guessed schedule.
  const newSessionItems = state.sessionItems.map((item) =>
    item.task.id === savedTask.id ? { ...item, task: savedTask } : item,
  );

  const currentItem =
    state.currentSessionItemIndex === null
      ? null
      : state.sessionItems[state.currentSessionItemIndex];
  if (
    state.currentReviewAreaQueueIndex === null ||
    state.currentSessionItemIndex === null ||
    state.currentReviewAreaQueueIndex >= state.reviewAreaQueue.length ||
    currentItem?.task.id !== savedTask.id ||
    currentItem.componentID !== reviewedComponentID
  ) {
    // The queue subscription may have already advanced while the post-save
    // projection was loading. Do not mark or skip that successor as well.
    return refillDueItems(
      { ...state, sessionItems: newSessionItems },
      nowTimestampMillis,
    );
  }

  // Advance to the item in the review area queue.
  let newSessionItemIndex: number;
  const newReviewAreaQueueIndex = state.currentReviewAreaQueueIndex + 1;
  if (newReviewAreaQueueIndex < state.reviewAreaQueue.length) {
    newSessionItemIndex = findSessionItemIndex(
      state.reviewAreaQueue[newReviewAreaQueueIndex],
      newSessionItems,
    );
  } else {
    newSessionItemIndex = state.currentSessionItemIndex;
  }

  return refillDueItems(
    {
      reviewAreaQueue: state.reviewAreaQueue,
      currentReviewAreaQueueIndex: newReviewAreaQueueIndex,
      sessionItems: newSessionItems,
      currentSessionItemIndex: newSessionItemIndex,
      // Automerge reviews are append-only, so do not offer a local-only undo.
      topUndoItem: null,
    },
    nowTimestampMillis,
  );
}

function refillDueItems(
  state: ReviewSessionManagerState,
  nowTimestampMillis: number,
): ReviewSessionManagerState {
  if (
    state.currentReviewAreaQueueIndex === null ||
    state.currentReviewAreaQueueIndex < state.reviewAreaQueue.length
  )
    return state;

  const areaItems = new Map(
    state.reviewAreaQueue.map((item) => [reviewAreaItemKey(item), item]),
  );
  const retries = state.sessionItems
    .filter((item) => itemIsStillDue(item, nowTimestampMillis))
    .map((item) => {
      const areaItem = areaItems.get(reviewItemKey(item));
      if (!areaItem)
        throw new Error("Retry item is absent from the review queue");
      return areaItem;
    });
  return reviewSessionManagerPushReviewAreaQueueItems(state, retries);
}

export function reviewSessionManagerDeleteCurrentItem(
  state: ReviewSessionManagerState,
): ReviewSessionManagerState {
  if (
    state.currentReviewAreaQueueIndex !== null &&
    state.currentSessionItemIndex !== null
  ) {
    const newReviewAreaQueue = [
      ...state.reviewAreaQueue.slice(0, state.currentReviewAreaQueueIndex),
      ...state.reviewAreaQueue.slice(state.currentReviewAreaQueueIndex + 1),
    ];
    const newSessionItems = [
      ...state.sessionItems.slice(0, state.currentSessionItemIndex),
      ...state.sessionItems.slice(state.currentSessionItemIndex + 1),
    ];
    const deletedTaskID =
      state.reviewAreaQueue[state.currentReviewAreaQueueIndex].taskID;

    return {
      reviewAreaQueue: newReviewAreaQueue,
      currentReviewAreaQueueIndex: state.currentReviewAreaQueueIndex,
      sessionItems: newSessionItems,
      currentSessionItemIndex:
        state.currentReviewAreaQueueIndex < state.reviewAreaQueue.length - 1
          ? findSessionItemIndex(
              newReviewAreaQueue[state.currentReviewAreaQueueIndex],
              newSessionItems,
            )
          : newSessionItems.length === 0
            ? null
            : newSessionItems.length - 1,
      topUndoItem: {
        previousState: state,
        getUndoMutations: () => {
          const eventID = generateUniqueID();
          return [
            {
              kind: "setTaskDeleted" as const,
              mutationID: `task-restore/${eventID}` as VaultMutationID,
              taskID: deletedTaskID,
              isDeleted: false,
            },
          ];
        },
      },
    };
  } else {
    return state;
  }
}

function reviewSessionManagerPushReviewAreaQueueItems(
  state: ReviewSessionManagerState,
  queueItems: ReviewAreaItem[],
): ReviewSessionManagerState {
  if (queueItems.length === 0) {
    return state;
  }

  const newReviewAreaQueue = [...state.reviewAreaQueue, ...queueItems];
  if (
    state.currentReviewAreaQueueIndex !== null &&
    state.currentSessionItemIndex !== null
  ) {
    return {
      reviewAreaQueue: newReviewAreaQueue,
      currentReviewAreaQueueIndex: state.currentReviewAreaQueueIndex,
      sessionItems: state.sessionItems,
      currentSessionItemIndex: findSessionItemIndex(
        newReviewAreaQueue[state.currentReviewAreaQueueIndex],
        state.sessionItems,
      ),
      topUndoItem: state.topUndoItem,
    };
  } else {
    return {
      reviewAreaQueue: newReviewAreaQueue,
      currentReviewAreaQueueIndex: 0,
      sessionItems: state.sessionItems,
      currentSessionItemIndex: findSessionItemIndex(
        newReviewAreaQueue[0],
        state.sessionItems,
      ),
      topUndoItem: state.topUndoItem,
    };
  }
}

export function reviewSessionManagerReconcileReviewQueue(
  state: ReviewSessionManagerState,
  reviewItems: ReviewItem[],
  reviewAreaItems: ReviewAreaItem[],
): ReviewSessionManagerState {
  if (reviewItems.length !== reviewAreaItems.length) {
    throw new Error("Review queue projections have different lengths");
  }
  if (state.currentReviewAreaQueueIndex === null) {
    return reviewSessionManagerPushReviewAreaQueueItems(
      { ...state, sessionItems: reviewItems },
      reviewAreaItems,
    );
  }

  const completedThrough = Math.min(
    state.currentReviewAreaQueueIndex,
    state.reviewAreaQueue.length,
  );
  const preservedQueue = state.reviewAreaQueue.slice(0, completedThrough);
  const currentItem = state.reviewAreaQueue[state.currentReviewAreaQueueIndex];
  const incomingKeys = new Set(reviewAreaItems.map(reviewAreaItemKey));
  // Keep an on-screen prompt stable while unrelated remote changes replace
  // the unseen tail. If another client reviewed or deleted that prompt, it is
  // absent from the authoritative queue and must not remain visible locally.
  if (currentItem && incomingKeys.has(reviewAreaItemKey(currentItem))) {
    preservedQueue.push(currentItem);
  }
  const preservedKeys = new Set(preservedQueue.map(reviewAreaItemKey));
  const reconciledReviewItems = reviewItems.filter(
    (item) => !preservedKeys.has(reviewItemKey(item)),
  );
  const reconciledReviewAreaItems = reviewAreaItems.filter(
    (item) => !preservedKeys.has(reviewAreaItemKey(item)),
  );

  const preservedSessionItems = state.sessionItems.filter((item) =>
    preservedKeys.has(reviewItemKey(item)),
  );
  const sessionItems = [...preservedSessionItems, ...reconciledReviewItems];
  const reviewAreaQueue = [...preservedQueue, ...reconciledReviewAreaItems];

  if (state.currentReviewAreaQueueIndex >= reviewAreaQueue.length) {
    return {
      ...state,
      sessionItems,
      reviewAreaQueue,
      currentReviewAreaQueueIndex: reviewAreaQueue.length,
      currentSessionItemIndex:
        sessionItems.length === 0
          ? null
          : Math.min(
              state.currentSessionItemIndex ?? 0,
              sessionItems.length - 1,
            ),
    };
  }

  return {
    ...state,
    sessionItems,
    reviewAreaQueue,
    currentSessionItemIndex: findSessionItemIndex(
      reviewAreaQueue[state.currentReviewAreaQueueIndex],
      sessionItems,
    ),
  };
}

function reviewItemKey(item: ReviewItem): string {
  return `${item.task.id}\u0000${item.componentID}`;
}

function reviewAreaItemKey(item: ReviewAreaItem): string {
  return `${item.taskID}\u0000${item.componentID}`;
}

function reviewSessionManagerJumpToItem(
  state: ReviewSessionManagerState,
  sessionItemIndex: number,
): ReviewSessionManagerState {
  if (sessionItemIndex >= state.reviewAreaQueue.length) {
    console.error(
      `Attempting to jump to review item index ${sessionItemIndex} which is out of bounds`,
    );
    return state;
  }
  if (
    state.currentReviewAreaQueueIndex === null ||
    state.currentSessionItemIndex === null
  ) {
    console.error(
      `Attempting to jump to review item index ${sessionItemIndex} when current review area queue index or current session item index is null`,
    );
    return state;
  }

  const sessionItem = state.sessionItems[sessionItemIndex];
  const queueIndex = state.reviewAreaQueue.findLastIndex(
    (reviewAreaItem) =>
      reviewAreaItem.taskID === sessionItem.task.id &&
      reviewAreaItem.componentID === sessionItem.componentID,
  );
  if (queueIndex === -1) {
    console.error(`Item not found in remaining queue`);
    return state;
  }

  const remainingReviewAreaQueue = state.reviewAreaQueue.slice(
    state.currentReviewAreaQueueIndex,
  );
  const remainingQueueIndex = queueIndex - state.currentReviewAreaQueueIndex;
  if (remainingQueueIndex >= 0) {
    console.log("Jumping to item", sessionItemIndex, remainingQueueIndex);
    // Rotate the queue so that the item we're jumping to is at the front.
    const rotatedRemainingQueue = [
      ...remainingReviewAreaQueue.slice(remainingQueueIndex),
      ...remainingReviewAreaQueue.slice(0, remainingQueueIndex),
    ];
    return {
      ...state,
      reviewAreaQueue: [
        ...state.reviewAreaQueue.slice(0, state.currentReviewAreaQueueIndex),
        ...rotatedRemainingQueue,
      ],
      currentReviewAreaQueueIndex: state.currentReviewAreaQueueIndex,
      currentSessionItemIndex: sessionItemIndex,
      topUndoItem: null, // jumping resets the undo stack for now...
    };
  } else {
    console.log("Item not in remaining queue; adding to front");
    return {
      ...state,
      reviewAreaQueue: [
        ...state.reviewAreaQueue.slice(0, state.currentReviewAreaQueueIndex),
        state.reviewAreaQueue[queueIndex],
        ...state.reviewAreaQueue.slice(state.currentReviewAreaQueueIndex + 1),
      ],
      currentReviewAreaQueueIndex: state.currentReviewAreaQueueIndex,
      currentSessionItemIndex: sessionItemIndex,
      topUndoItem: null, // jumping resets the undo stack for now...
    };
  }
}

const initialReviewSessionManagerState: ReviewSessionManagerState = {
  reviewAreaQueue: [],
  currentReviewAreaQueueIndex: null,

  sessionItems: [],
  currentSessionItemIndex: null,

  topUndoItem: null,
};

type ReviewSessionManagerUndoStackItem = {
  previousState: ReviewSessionManagerState;
  getUndoMutations: () => VaultMutation[];
};

export function useReviewSessionManager(): ReviewSessionManagerActions &
  ReviewSessionManagerState {
  const [state, setState] = useState<ReviewSessionManagerState>(
    initialReviewSessionManagerState,
  );

  const reviewSessionManagerActions: ReviewSessionManagerActions = useMemo(
    () => ({
      markCurrentItem: (savedTask, reviewedComponentID) => {
        const nowTimestampMillis = Date.now();
        setState((state) =>
          reviewSessionManagerMarkCurrentItem(
            state,
            savedTask,
            reviewedComponentID,
            nowTimestampMillis,
          ),
        );
      },

      reconcileReviewQueue: (reviewItems, reviewAreaItems) =>
        setState((state) =>
          reviewSessionManagerReconcileReviewQueue(
            state,
            reviewItems,
            reviewAreaItems,
          ),
        ),

      undo: () => {
        setState((state) => {
          const { topUndoItem } = state;
          if (!topUndoItem) {
            throw new Error("Nothing on the undo stack");
          }
          return topUndoItem.previousState;
        });
      },

      deleteCurrentItem() {
        setState((state) => reviewSessionManagerDeleteCurrentItem(state));
      },

      jumpToItem(sessionItemIndex: number) {
        setState((state) =>
          reviewSessionManagerJumpToItem(state, sessionItemIndex),
        );
      },
    }),
    [],
  );

  return { ...reviewSessionManagerActions, ...state };
}
