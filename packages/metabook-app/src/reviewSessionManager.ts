import {
  ActionLogID,
  applyActionLogToPromptState,
  getIDForPromptSync,
  getIDForPromptTask,
  PromptActionLog,
  PromptOf,
  PromptParametersOf,
  PromptTask,
} from "metabook-core";
import { ReviewItem } from "metabook-embedded-support";
import { ReviewAreaItem } from "metabook-ui";
import { useMemo, useState } from "react";

export interface ReviewSessionManagerState {
  reviewAreaQueue: ReviewAreaItem[];
  currentReviewAreaQueueIndex: number | null;

  sessionItems: ReviewItem[];
  currentSessionItemIndex: number | null;
}

export interface ReviewSessionManagerActions {
  markCurrentItem(
    logEntries: { log: PromptActionLog; id: ActionLogID }[],
    continuation?: (newState: ReviewSessionManagerState) => void,
  ): void;

  updateSessionItems(
    mutator: (sessionItems: ReviewItem[]) => ReviewItem[],
  ): void;

  pushReviewAreaQueueItems(items: ReviewAreaItem[]): void;
}

function getPromptTaskIDForPromptAndParameters<PT extends PromptTask>(
  prompt: PromptOf<PT>,
  promptParameters: PromptParametersOf<PT>,
): string {
  return getIDForPromptTask({
    promptID: getIDForPromptSync(prompt),
    promptType: prompt.promptType,
    promptParameters: promptParameters,
  } as PromptTask);
}

function findSessionItemIndex(
  reviewAreaItem: ReviewAreaItem,
  sessionItems: ReviewItem[],
): number {
  const reviewAreaItemPromptTaskID = getPromptTaskIDForPromptAndParameters(
    reviewAreaItem.prompt,
    reviewAreaItem.promptParameters,
  );
  const index = sessionItems.findIndex(
    (sessionItem) => sessionItem.promptTaskID === reviewAreaItemPromptTaskID,
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
  logEntries: { log: PromptActionLog; id: ActionLogID }[],
): ReviewSessionManagerState {
  if (
    state.currentSessionItemIndex === null ||
    state.currentReviewAreaQueueIndex === null
  ) {
    throw new Error(
      `Attempting to mark current item when session item index or review area queue index is null`,
    );
  }

  const currentReviewItem = state.sessionItems[state.currentSessionItemIndex];

  let promptState = currentReviewItem.promptState;
  for (const { log, id } of logEntries) {
    if (log.taskID !== currentReviewItem.promptTaskID) {
      throw new Error(
        `Attempting to record log for ${log.taskID}, but current prompt is ${currentReviewItem.promptTaskID}!`,
      );
    }

    const newPromptState = applyActionLogToPromptState({
      promptActionLog: log,
      actionLogID: id,
      basePromptState: promptState,
      schedule: "default",
    });
    if (newPromptState instanceof Error) {
      throw new Error(
        `Error applying ${JSON.stringify(log, null, "\t")} to ${JSON.stringify(
          promptState,
        )}: ${newPromptState}`,
      );
    }
    promptState = newPromptState;
  }

  const newSessionItems = [...state.sessionItems];
  newSessionItems[state.currentSessionItemIndex] = {
    ...newSessionItems[state.currentSessionItemIndex],
    promptState,
  };

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
      markCurrentItem: (logEntries, continuation) => {
        setState((state) =>
          reviewSessionManagerMarkCurrentItem(state, logEntries),
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

      updateSessionItems: (mutator) =>
        setState((state) =>
          reviewSessionManagerUpdateSessionItems(state, mutator),
        ),
    }),
    [],
  );

  return { ...reviewSessionManagerActions, ...state };
}
