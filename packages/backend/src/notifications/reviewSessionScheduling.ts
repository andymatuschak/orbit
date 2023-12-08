import {
  createReviewQueue,
  defaultReviewSessionMaximumQueueSize,
  getReviewQueueFuzzyDueTimestampThreshold,
  ReviewItem,
  Task,
} from "@withorbit/core";
import * as dateFns from "date-fns";

// We'll delay review sessions until we estimate doing so would cause at least this many prompts to be forgotten because of the delay.
const forgottenPromptCountThreshold = 2;

// The assumed prior probability that users will remember a prompt correctly when it's due. Used to estimate the "cost" of delaying a review session. Someday this should be computed dynamically.
const estimatedAccuracyAtDueTime = 0.9;

// We look ahead a few days to see if we can get a fuller session by waiting (without incurring too many highly overdue prompts). This variable is the number of days we'll look ahead.
export const reviewSessionBatchingLookaheadDays = 7;

// Returns the estimated marginal number of prompts which we expect will be forgotten due to being overdue: i.e. the number we expected to be forgotten minus the number we expect would be forgotten if every prompt were answered exactly when it was due.
function estimateOverdueForgottenItemCount(
  reviewItems: ReviewItem[],
  timestampMillis: number,
): number {
  const oneDayIntervalMillis = 1000 * 60 * 60 * 24;
  return reviewItems.reduce((total, reviewItem) => {
    const state = reviewItem.task.componentStates[reviewItem.componentID];
    const unitOverdueInterval =
      (timestampMillis - state.dueTimestampMillis) /
      Math.max(oneDayIntervalMillis, state.intervalMillis);
    const estimatedAccuracy = Math.min(
      Math.pow(estimatedAccuracyAtDueTime, unitOverdueInterval),
      1,
    );
    return total + (1 - estimatedAccuracy);
  }, 0);
}

type ReviewSessionSchedulingDecision =
  | {
      shouldScheduleSession: true;
      reason:
        | "full-session-ready"
        | "too-many-overdue"
        | "no-better-session-soon";
    }
  | {
      shouldScheduleSession: false;
      reason: "no-prompts-due" | "fuller-session-soon";
    };

export function evaluateReviewSessionSchedule(
  sessionTimestampMillis: number,
  upcomingTasks: Task[],
  activePromptCount: number | null,
): ReviewSessionSchedulingDecision {
  if (activePromptCount === null || activePromptCount === 0) {
    if (upcomingTasks.length > 0) {
      throw new Error(
        `Inconsistency: ${upcomingTasks.length} upcoming prompt states but missing activePromptCount`,
      );
    }
    return { shouldScheduleSession: false, reason: "no-prompts-due" };
  }

  const sessionMaxPromptCount = Math.min(
    activePromptCount,
    defaultReviewSessionMaximumQueueSize,
  );
  const initiallyDueReviewItems =
    filterReviewItemsByThresholdDueTimestampMillis(
      createReviewQueue(upcomingTasks),
      sessionTimestampMillis,
    );

  if (initiallyDueReviewItems.length >= sessionMaxPromptCount) {
    return { shouldScheduleSession: true, reason: "full-session-ready" };
  } else if (initiallyDueReviewItems.length === 0) {
    return { shouldScheduleSession: false, reason: "no-prompts-due" };
  } else if (
    estimateOverdueForgottenItemCount(
      initiallyDueReviewItems,
      sessionTimestampMillis,
    ) >= forgottenPromptCountThreshold
  ) {
    return { shouldScheduleSession: true, reason: "too-many-overdue" };
  }

  for (
    let dayIndex = 0;
    dayIndex < reviewSessionBatchingLookaheadDays;
    dayIndex++
  ) {
    const futureSessionTimestampMillis = dateFns
      .addDays(sessionTimestampMillis, dayIndex)
      .valueOf();
    const futureDueReviewItems = filterReviewItemsByThresholdDueTimestampMillis(
      createReviewQueue(upcomingTasks),
      futureSessionTimestampMillis,
    );

    if (
      estimateOverdueForgottenItemCount(
        futureDueReviewItems,
        futureSessionTimestampMillis,
      ) >= forgottenPromptCountThreshold
    ) {
      // We don't want to postpone review this far (or further) because it'll "cost" too many marginal forgotten prompts.
      break;
    }

    if (futureDueReviewItems.length > initiallyDueReviewItems.length) {
      return { shouldScheduleSession: false, reason: "fuller-session-soon" };
    }
  }

  return { shouldScheduleSession: true, reason: "no-better-session-soon" };
}

function filterReviewItemsByThresholdDueTimestampMillis(
  items: ReviewItem[],
  dueTimestampMillis: number,
): ReviewItem[] {
  const threshold =
    getReviewQueueFuzzyDueTimestampThreshold(dueTimestampMillis);
  return items.filter(
    ({ componentID, task }) =>
      task.componentStates[componentID].dueTimestampMillis <= threshold,
  );
}
