import {
  EventForEntity,
  eventReducer,
  ReviewItem,
  Task,
  TaskID,
} from "@withorbit/core";
import { ReviewAreaItem } from "@withorbit/ui";
import { useMemo, useRef, useState } from "react";

export interface ReviewSessionManagerState {
  reviewAreaQueue: ReviewAreaItem[];
  currentReviewAreaQueueIndex: number | null;

  sessionItems: ReviewItem[];
  currentSessionItemIndex: number | null;
}

export interface ReviewSessionManagerActions {
  markCurrentItem(
    events: EventForEntity<Task>[],
    continuation?: (newState: ReviewSessionManagerState) => void,
  ): void;

  updateSessionItems(
    mutator: (sessionItems: ReviewItem[]) => ReviewItem[],
  ): void;

  pushReviewAreaQueueItems(items: ReviewAreaItem[]): void;
  removeReviewAreaQueueItems(itemIDs: TaskID[]): void;

  undo(): void;
}

function findSessionItemIndex(
  reviewAreaItem: ReviewAreaItem,
  sessionItems: ReviewItem[],
): number {
  const index = sessionItems.findIndex(
    (sessionItem) => sessionItem.task.id === reviewAreaItem.taskID,
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
  events: EventForEntity<Task>[],
): ReviewSessionManagerState {
  if (
    state.currentSessionItemIndex === null ||
    state.currentReviewAreaQueueIndex === null
  ) {
    throw new Error(
      `Attempting to mark current item when session item index or review area queue index is null`,
    );
  }

  // Update the Task in our session items list with the events.
  const newSessionItems = [...state.sessionItems];
  newSessionItems[state.currentSessionItemIndex] = {
    ...newSessionItems[state.currentSessionItemIndex],
    task: events.reduce(
      (task, event) => eventReducer(task, event),
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
  };
}

function reviewSessionManagerUpdateSessionItems(
  state: ReviewSessionManagerState,
  mutator: (sessionItems: ReviewItem[]) => ReviewItem[],
): ReviewSessionManagerState {
  const newSessionItems = mutator(state.sessionItems);

  // In case prompt contents have been edited, update the specs in ReviewAreaItems with the specs from the new ReviewItems.
  // This is a pretty gross consequence of coupling uniqued state (the queue's contents) with derived state (the specs). It would be cleaner to store a queue of task IDs and to derive the ReviewAreaItems from that, but I was trying to avoid a third layer. Probably the wrong trade.
  const reviewItemsByTaskID = new Map(
    newSessionItems.map((item) => [item.task.id, item]),
  );
  const newReviewAreaQueue: ReviewAreaItem[] = state.reviewAreaQueue.map(
    (reviewAreItem) => {
      const reviewItem = reviewItemsByTaskID.get(reviewAreItem.taskID);
      if (reviewItem) {
        return { ...reviewAreItem, spec: reviewItem.task.spec };
      } else {
        return reviewAreItem;
      }
    },
  );

  let newCurrentSessionItemIndex: number | null;
  if (state.currentReviewAreaQueueIndex === null) {
    newCurrentSessionItemIndex = null;
  } else {
    if (state.currentReviewAreaQueueIndex >= newReviewAreaQueue.length) {
      // If we're past the end of the queue, freeze the starburst wherever it stopped. Not a great solution.
      newCurrentSessionItemIndex = state.currentSessionItemIndex;
    } else {
      try {
        newCurrentSessionItemIndex = findSessionItemIndex(
          newReviewAreaQueue[state.currentReviewAreaQueueIndex],
          newSessionItems,
        );
      } catch {
        // HACK for deleting a prompt you're viewing... not thinking about this carefully right now.
        newCurrentSessionItemIndex = state.currentSessionItemIndex;
      }
    }
  }

  return {
    ...state,
    reviewAreaQueue: newReviewAreaQueue,
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
    };
  }
}

function reviewSessionManagerRemoveReviewAreaQueueItems(
  state: ReviewSessionManagerState,
  taskIDs: TaskID[],
): ReviewSessionManagerState {
  if (taskIDs.length === 0) {
    return state;
  }

  const taskIDSet = new Set(taskIDs);
  const newReviewAreaQueue: ReviewAreaItem[] = [];
  let newReviewAreaQueueIndex = 0;
  for (let i = 0; i < state.reviewAreaQueue.length; i++) {
    const item = state.reviewAreaQueue[i];
    if (!taskIDSet.has(item.taskID)) {
      newReviewAreaQueue.push(item);
      if (
        state.currentReviewAreaQueueIndex !== null &&
        i < state.currentReviewAreaQueueIndex
      ) {
        newReviewAreaQueueIndex++;
      }
    }
  }

  if (
    state.currentReviewAreaQueueIndex !== null &&
    state.currentSessionItemIndex !== null
  ) {
    return {
      reviewAreaQueue: newReviewAreaQueue,
      currentReviewAreaQueueIndex: newReviewAreaQueueIndex,
      sessionItems: state.sessionItems,
      currentSessionItemIndex: findSessionItemIndex(
        newReviewAreaQueue[
          Math.min(newReviewAreaQueueIndex, newReviewAreaQueue.length - 1)
        ],
        state.sessionItems,
      ),
    };
  } else {
    return {
      reviewAreaQueue: newReviewAreaQueue,
      currentReviewAreaQueueIndex: null,
      sessionItems: state.sessionItems,
      currentSessionItemIndex: null,
    };
  }
}

const initialReviewSessionManagerState: ReviewSessionManagerState = {
  reviewAreaQueue: [],
  currentReviewAreaQueueIndex: null,

  sessionItems: [],
  currentSessionItemIndex: null,
};

export function useReviewSessionManager(): ReviewSessionManagerActions &
  ReviewSessionManagerState {
  const [state, setState] = useState<ReviewSessionManagerState>(
    initialReviewSessionManagerState,
  );
  const undoStack = useRef<ReviewSessionManagerState[]>([]);

  const pushUndoableState: typeof setState = (action) => {
    setState((state) => {
      undoStack.current = [state, ...undoStack.current];
      if (typeof action === "function") {
        return action(state);
      } else {
        return state;
      }
    });
  };

  const reviewSessionManagerActions: ReviewSessionManagerActions = useMemo(
    () => ({
      markCurrentItem: (events, continuation) => {
        pushUndoableState((state) =>
          reviewSessionManagerMarkCurrentItem(state, events),
        );
        // This is a pretty heinous abuse. Clients need to access the new state, so we invoke the reducer again but return its input (making it a no-op) to call the continuation with the correct context.
        if (continuation) {
          setState((newState) => {
            continuation(newState);
            return newState;
          });
        }
      },
      pushReviewAreaQueueItems: (queueItems) =>
        setState((state) =>
          reviewSessionManagerPushReviewAreaQueueItems(state, queueItems),
        ),

      removeReviewAreaQueueItems: (taskIDs: TaskID[]) =>
        setState((state) =>
          reviewSessionManagerRemoveReviewAreaQueueItems(state, taskIDs),
        ),

      updateSessionItems: (mutator) =>
        setState((state) =>
          reviewSessionManagerUpdateSessionItems(state, mutator),
        ),

      undo: () => {
        const [state, ...newUndoStack] = undoStack.current;
        undoStack.current = newUndoStack;
        setState(state);
      },
    }),
    [],
  );

  return { ...reviewSessionManagerActions, ...state };
}
