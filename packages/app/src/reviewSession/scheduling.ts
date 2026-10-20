import {
  createVaultSchedulerAdapter,
  isReviewDue,
  type ReviewItem,
  type SchedulerPolicy,
  type Task,
  type TaskRepetitionOutcome,
  type VaultMutation,
} from "@withorbit/core";

export type ReviewMutation = Extract<VaultMutation, { kind: "recordReview" }>;

/** Temporary UI state only; the saved observation remains authoritative. */
export function getTaskAfterReview(
  item: ReviewItem,
  policy: SchedulerPolicy,
  review: ReviewMutation,
): Task {
  if (
    review.taskID !== item.task.id ||
    review.componentID !== item.componentID ||
    !Object.hasOwn(item.task.componentStates, item.componentID)
  )
    throw new Error("Review does not match the displayed task component");
  const state = createVaultSchedulerAdapter(policy).applyReview(
    item.task.componentStates[item.componentID],
    { ...review, kind: "review" },
  );
  return {
    ...item.task,
    componentStates: {
      ...item.task.componentStates,
      [item.componentID]: state,
    },
  };
}

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
