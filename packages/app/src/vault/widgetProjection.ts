import {
  TaskRepetitionOutcome,
  type ObservationID,
  type ReviewItem,
  type TaskID,
  type VaultID,
  type VaultMutationID,
} from "@withorbit/core";

export interface WidgetReviewOutboxRecord {
  mutationID: VaultMutationID;
  observationID: ObservationID;
  taskID: TaskID;
  componentID: string;
  outcome: TaskRepetitionOutcome;
  occurredAtTimestampMillis: number;
}

export interface WidgetProjectionBridge {
  /** Finish an app review and its handoff even if Home suspends the app. */
  finishInBackground?(operation: () => Promise<void>): Promise<void>;
  subscribeToForeground?(listener: () => void): () => void;
  replaceProjection(input: {
    vaultID: VaultID;
    reviewItems: readonly ReviewItem[];
    revision: string;
  }): Promise<void>;
  readPendingReviews(vaultID: VaultID): Promise<WidgetReviewOutboxRecord[]>;
  markReviewsImported(input: {
    vaultID: VaultID;
    observationIDs: readonly ObservationID[];
    reviewItems: readonly ReviewItem[];
    revision: string;
  }): Promise<void>;
}

export function decodeWidgetReviewOutbox(
  serialized: string,
): WidgetReviewOutboxRecord[] {
  const value = JSON.parse(serialized) as unknown;
  if (!Array.isArray(value)) throw new Error("Malformed widget review outbox");
  return value.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.mutationID !== "string" ||
      typeof entry.observationID !== "string" ||
      !/^review\/[0-9A-Za-z_-]{22}$/.test(entry.observationID) ||
      typeof entry.taskID !== "string" ||
      typeof entry.componentID !== "string" ||
      (entry.outcome !== TaskRepetitionOutcome.Remembered &&
        entry.outcome !== TaskRepetitionOutcome.Forgotten) ||
      !Number.isSafeInteger(entry.occurredAtTimestampMillis)
    ) {
      throw new Error("Malformed widget review outbox record");
    }
    if (entry.mutationID !== entry.observationID) {
      throw new Error("Malformed widget review outbox record");
    }
    return entry as unknown as WidgetReviewOutboxRecord;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
