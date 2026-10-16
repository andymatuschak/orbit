import {
  createVaultSchedulerAdapter,
  isReviewDue,
  type ReviewItem,
  type SchedulerPolicy,
  type TaskRepetitionOutcome,
} from "@withorbit/core";

/** Shared eligibility for end-of-session refills and the pending starburst. */
export function itemIsStillDue(
  item: ReviewItem,
  nowTimestampMillis = Date.now(),
): boolean {
  const state = item.task.componentStates[item.componentID];
  return isReviewDue(
    state.dueTimestampMillis,
    nowTimestampMillis,
    state.fsrs?.isRetry,
  );
}

/** Preview with the same policy and absolute review time as the vault. */
export function getReviewIntervalAfterOutcome(
  item: ReviewItem,
  policy: SchedulerPolicy,
  outcome: TaskRepetitionOutcome,
  timestampMillis: number,
): number {
  return createVaultSchedulerAdapter(policy).applyReview(
    item.task.componentStates[item.componentID],
    {
      kind: "review",
      taskID: item.task.id,
      componentID: item.componentID,
      reviewSessionID: null,
      outcome,
      occurredAtTimestampMillis: timestampMillis,
    },
  ).intervalMillis;
}
