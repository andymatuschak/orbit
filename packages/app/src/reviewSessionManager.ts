import {
  createOrbitSchedulerAdapter,
  defaultOrbitSchedulerPolicy,
  generateUniqueID,
  ReviewItem,
  Task,
  type ReviewObservation,
  type VaultMutation,
  type VaultMutationID,
} from "@withorbit/core";
import { ReviewAreaItem } from "./ui/index.js";
import { useMemo, useState } from "react";

export interface ReviewSessionManagerState {
  reviewAreaQueue: ReviewAreaItem[];
  currentReviewAreaQueueIndex: number | null;

  sessionItems: ReviewItem[];
  currentSessionItemIndex: number | null;

  topUndoItem: ReviewSessionManagerUndoStackItem | null;
}

export interface ReviewSessionManagerActions {
  markCurrentItem(
    mutations: readonly RecordReviewMutation[],
    continuation?: (newState: ReviewSessionManagerState) => void,
  ): void;

  updateSessionItems(
    mutator: (sessionItems: ReviewItem[]) => ReviewItem[],
  ): void;

  pushReviewAreaQueueItems(items: ReviewAreaItem[]): void;

  reconcileReviewQueue(
    reviewItems: ReviewItem[],
    reviewAreaItems: ReviewAreaItem[],
  ): void;

  undo(
    continuation?: (undoItem: ReviewSessionManagerUndoStackItem) => void,
  ): void;

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

function reviewSessionManagerMarkCurrentItem(
  state: ReviewSessionManagerState,
  mutations: readonly RecordReviewMutation[],
): ReviewSessionManagerState {
  if (
    state.currentSessionItemIndex === null ||
    state.currentReviewAreaQueueIndex === null
  ) {
    throw new Error(
      `Attempting to mark current item when session item index or review area queue index is null`,
    );
  }

  // Apply the same typed reviews optimistically that the database receives.
  const newSessionItems = [...state.sessionItems];
  newSessionItems[state.currentSessionItemIndex] = {
    ...newSessionItems[state.currentSessionItemIndex],
    task: mutations.reduce(
      (task, mutation) => applyReviewMutation(task, mutation),
      state.sessionItems[state.currentSessionItemIndex].task,
    ),
  };

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

  return {
    reviewAreaQueue: state.reviewAreaQueue,
    currentReviewAreaQueueIndex: newReviewAreaQueueIndex,
    sessionItems: newSessionItems,
    currentSessionItemIndex: newSessionItemIndex,
    // Automerge reviews are append-only, so do not offer a local-only undo.
    topUndoItem: null,
  };
}

function reviewSessionManagerDeleteCurrentItem(
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

function reviewSessionManagerUpdateSessionItems(
  state: ReviewSessionManagerState,
  mutator: (sessionItems: ReviewItem[]) => ReviewItem[],
): ReviewSessionManagerState {
  const newSessionItems = mutator(state.sessionItems);

  let newCurrentSessionItemIndex: number | null;
  if (state.currentReviewAreaQueueIndex === null) {
    newCurrentSessionItemIndex = null;
  } else {
    if (state.currentReviewAreaQueueIndex >= state.reviewAreaQueue.length) {
      // If we're past the end of the queue, freeze the starburst wherever it stopped. Not a great solution.
      newCurrentSessionItemIndex = state.currentSessionItemIndex;
    } else {
      newCurrentSessionItemIndex = findSessionItemIndex(
        state.reviewAreaQueue[state.currentReviewAreaQueueIndex],
        newSessionItems,
      );
    }
  }

  return {
    ...state,
    sessionItems: newSessionItems,
    currentSessionItemIndex: newCurrentSessionItemIndex,
  };
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
      markCurrentItem: (mutations, continuation) => {
        setState((state) => {
          const next = reviewSessionManagerMarkCurrentItem(state, mutations);
          continuation?.(next);
          return next;
        });
      },
      pushReviewAreaQueueItems: (queueItems) =>
        setState((state) =>
          reviewSessionManagerPushReviewAreaQueueItems(state, queueItems),
        ),

      reconcileReviewQueue: (reviewItems, reviewAreaItems) =>
        setState((state) =>
          reviewSessionManagerReconcileReviewQueue(
            state,
            reviewItems,
            reviewAreaItems,
          ),
        ),

      updateSessionItems: (mutator) =>
        setState((state) =>
          reviewSessionManagerUpdateSessionItems(state, mutator),
        ),

      undo: (continuation) => {
        setState((state) => {
          const { topUndoItem } = state;
          if (!topUndoItem) {
            throw new Error("Nothing on the undo stack");
          }
          continuation?.(topUndoItem);
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

type RecordReviewMutation = Extract<VaultMutation, { kind: "recordReview" }>;

const optimisticScheduler = createOrbitSchedulerAdapter(
  defaultOrbitSchedulerPolicy,
);

function applyReviewMutation(task: Task, mutation: RecordReviewMutation): Task {
  if (mutation.taskID !== task.id) {
    throw new Error("Review mutation does not match the current task");
  }
  const state = task.componentStates[mutation.componentID];
  if (!state)
    throw new Error("Review mutation references an unknown component");
  const observation: ReviewObservation = {
    kind: "review",
    taskID: mutation.taskID,
    componentID: mutation.componentID,
    reviewSessionID: mutation.reviewSessionID,
    outcome: mutation.outcome,
    occurredAtTimestampMillis: mutation.occurredAtTimestampMillis,
  };
  return {
    ...task,
    componentStates: {
      ...task.componentStates,
      [mutation.componentID]: optimisticScheduler.applyReview(
        state,
        observation,
      ),
    },
  };
}
