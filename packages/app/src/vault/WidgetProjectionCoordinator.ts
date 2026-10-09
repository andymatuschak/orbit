import {
  type ReviewItem,
  type VaultID,
  type VaultMutation,
} from "@withorbit/core";
import type { WidgetProjectionBridge } from "./widgetProjection.js";

type WidgetProjectionSource =
  readonly ReviewItem[] | (() => Promise<readonly ReviewItem[]>);

/**
 * The only bridge between an authoritative database and WidgetKit's small
 * disposable queue and durable pending-review handoff.
 */
export class WidgetProjectionCoordinator {
  private operation: Promise<unknown> = Promise.resolve();
  private publishQueued = false;
  private pendingSource:
    { source: WidgetProjectionSource; epoch: number } | undefined;
  private projectionEpoch = 0;
  private isClosed = false;

  constructor(
    private readonly vaultID: VaultID,
    private readonly bridge: WidgetProjectionBridge,
    private readonly onPublishError: (error: unknown) => void = (error) =>
      console.error("Could not update the review widget", error),
  ) {}

  async importPendingReviews(
    apply: (mutations: readonly VaultMutation[]) => Promise<void>,
    readFreshQueue: () => Promise<readonly ReviewItem[]>,
  ): Promise<number> {
    return this.enqueue(async () => {
      // Finish an import already in progress, but do not start a queued resume
      // after its database has detached and begun closing.
      if (this.isClosed) return 0;
      // Discard snapshots captured before/during import; all publications and
      // acknowledgements use this same serial lane, never a cross-process lock.
      this.projectionEpoch++;
      this.pendingSource = undefined;
      const records = await this.bridge.readPendingReviews(this.vaultID);
      if (records.length === 0) return 0;
      await apply(
        records.map((record) => ({
          kind: "recordReview" as const,
          mutationID: record.mutationID,
          observationID: record.observationID,
          taskID: record.taskID,
          componentID: record.componentID,
          reviewSessionID: "WIDGET",
          outcome: record.outcome,
          occurredAtTimestampMillis: record.occurredAtTimestampMillis,
        })),
      );
      const reviewItems = await readFreshQueue();
      this.projectionEpoch++;
      this.pendingSource = undefined;
      await this.bridge.markReviewsImported({
        vaultID: this.vaultID,
        observationIDs: records.map(({ observationID }) => observationID),
        reviewItems,
        revision: await digestReviewItems(reviewItems),
      });
      return records.length;
    });
  }

  private async writeProjection(
    reviewItems: readonly ReviewItem[],
  ): Promise<void> {
    await this.bridge.replaceProjection({
      vaultID: this.vaultID,
      reviewItems,
      revision: await digestReviewItems(reviewItems),
    });
  }

  /**
   * Serializes disposable projection writes and coalesces queued work so an
   * older queue can never finish after, and replace, a newer one.
   */
  publishLatest(source: WidgetProjectionSource): Promise<void> {
    if (this.isClosed) return Promise.resolve();
    this.pendingSource = { source, epoch: this.projectionEpoch };
    if (!this.publishQueued) {
      this.publishQueued = true;
      void this.enqueue(() => this.drainPublications());
    }
    return this.operation.then(() => undefined);
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    await this.operation;
  }

  private async drainPublications(): Promise<void> {
    try {
      while (this.pendingSource) {
        const { source, epoch } = this.pendingSource;
        this.pendingSource = undefined;
        if (epoch !== this.projectionEpoch) continue;
        try {
          await this.writeProjection(
            typeof source === "function" ? await source() : source,
          );
        } catch (error) {
          this.onPublishError(error);
        }
      }
    } finally {
      this.publishQueued = false;
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation);
    this.operation = result.catch(() => undefined);
    return result;
  }
}

async function digestReviewItems(reviewItems: readonly ReviewItem[]) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(
      reviewItems
        .map(({ task, componentID }) => [task.id, componentID, task])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    ),
  );
  const digest = new Uint8Array(
    globalThis.crypto?.subtle
      ? await globalThis.crypto.subtle.digest("SHA-256", bytes)
      : await (async () => {
          const Crypto = await import("expo-crypto");
          return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
        })(),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
