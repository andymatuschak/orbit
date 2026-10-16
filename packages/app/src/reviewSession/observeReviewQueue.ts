import type { ReviewItem } from "@withorbit/core";
import type { ReviewDatabase } from "../model2/openReviewDatabase.js";

export interface ReviewQueueState {
  queue: ReviewItem[] | null;
  error: Error | null;
}

/** An initial read must not replace a newer pushed queue, even when it fails. */
export function observeReviewQueue(
  database: Pick<ReviewDatabase, "fetchReviewQueue" | "subscribeToReviewQueue">,
  onState: (state: ReviewQueueState) => void,
): () => void {
  let isCanceled = false;
  let hasPushedQueue = false;
  const unsubscribe = database.subscribeToReviewQueue((queue) => {
    if (isCanceled) return;
    hasPushedQueue = true;
    onState({ queue, error: null });
  });
  void database.fetchReviewQueue().then(
    (queue) => {
      if (isCanceled || hasPushedQueue) return;
      onState({ queue, error: null });
    },
    (error: unknown) => {
      if (isCanceled || hasPushedQueue) return;
      console.error("Could not load review queue", error);
      onState({
        queue: null,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    },
  );
  return () => {
    isCanceled = true;
    unsubscribe();
  };
}
