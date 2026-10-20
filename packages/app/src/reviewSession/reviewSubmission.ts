import type { TaskID, VaultMutationID } from "@withorbit/core";
import type { ReviewMutation } from "./scheduling.js";

type SaveReview = (mutation: ReviewMutation) => Promise<void>;
export interface ReviewSaveState {
  failedCount: number;
  isRetrying: boolean;
}

/** Ephemeral UI acceptance/retry state, not another durable review journal. */
export class ReviewSubmission {
  private card = { identity: "", submitted: false };
  private readonly unsaved = new Map<
    VaultMutationID,
    { mutation: ReviewMutation; failed: boolean }
  >();
  private readonly latest = new Map<TaskID, VaultMutationID>();
  private isRetrying = false;

  constructor(
    private readonly changed: (state: ReviewSaveState) => void,
    private readonly saved: (mutation: ReviewMutation) => void,
  ) {}

  showCard(identity: string) {
    if (this.card.identity !== identity)
      this.card = { identity, submitted: false };
  }

  canSubmit(identity: string) {
    return this.card.identity === identity && !this.card.submitted;
  }

  get hasUnsavedReviews() {
    return this.unsaved.size > 0;
  }

  savedTaskVersion(taskID: TaskID) {
    if (
      [...this.unsaved.values()].some(
        ({ mutation }) => mutation.taskID === taskID,
      )
    )
      return undefined;
    return this.latest.get(taskID);
  }

  submit(
    identity: string,
    mutation: ReviewMutation,
    advance: () => void,
    save: SaveReview,
    settled: () => void,
  ): Promise<void> | undefined {
    if (!this.canSubmit(identity)) return;
    this.card.submitted = true;
    const entry = { mutation, failed: false };
    this.unsaved.set(mutation.mutationID, entry);
    this.latest.set(mutation.taskID, mutation.mutationID);
    advance();
    return this.save(entry, save, settled);
  }

  async retryFailed(save: SaveReview, settled: () => void): Promise<void> {
    if (this.isRetrying) return;
    const failed = [...this.unsaved.values()].filter((entry) => entry.failed);
    if (!failed.length) return;
    this.isRetrying = true;
    this.notify();
    try {
      await Promise.all(failed.map((entry) => this.save(entry, save, settled)));
    } finally {
      this.isRetrying = false;
      this.notify();
    }
  }

  private async save(
    entry: { mutation: ReviewMutation; failed: boolean },
    save: SaveReview,
    settled: () => void,
  ) {
    try {
      await save(entry.mutation);
    } catch (error) {
      entry.failed = true;
      this.notify();
      console.error("Couldn't save review", entry.mutation.taskID, error);
      settled();
      return;
    }
    this.unsaved.delete(entry.mutation.mutationID);
    if (entry.failed) this.notify();
    try {
      this.saved(entry.mutation);
    } catch (error) {
      console.error("Review saved, but could not refresh its task", error);
    } finally {
      settled();
    }
  }

  private notify() {
    this.changed({
      failedCount: [...this.unsaved.values()].filter((entry) => entry.failed)
        .length,
      isRetrying: this.isRetrying,
    });
  }
}
