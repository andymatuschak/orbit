import { EventForEntity, eventReducer, Task } from "@withorbit/core2";
import { ReviewItem } from "@withorbit/embedded-support";
import { ReviewAreaItem } from "@withorbit/ui";
import { useMemo, useState } from "react";

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

  const reviewSessionManagerActions: ReviewSessionManagerActions = useMemo(
    () => ({
      markCurrentItem: (events, continuation) => {
        setState((state) => reviewSessionManagerMarkCurrentItem(state, events));
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

      updateSessionItems: (mutator) =>
        setState((state) =>
          reviewSessionManagerUpdateSessionItems(state, mutator),
        ),
    }),
    [],
  );

  return { ...reviewSessionManagerActions, ...state };
}
