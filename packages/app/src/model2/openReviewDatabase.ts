import type { AttachmentID, ReviewItem, VaultMutation } from "@withorbit/core";
import type { LabConnection } from "../vault/labConnection.js";

export interface ReviewDatabase {
  fetchReviewQueue(): Promise<ReviewItem[]>;
  subscribeToReviewQueue(
    listener: (reviewItems: ReviewItem[]) => void,
  ): () => void;
  close(): Promise<void>;
  apply(mutations: readonly VaultMutation[]): Promise<void>;
  getURLForAttachmentID(attachmentID: AttachmentID): Promise<string | null>;
}

/** Cached Lab documents open locally; an unreachable laptop only delays sync. */
export async function openReviewDatabase(
  connection: LabConnection,
): Promise<ReviewDatabase> {
  const { openLabReviewDatabase } = await import("../vault/createRepo.js");
  return openLabReviewDatabase(connection);
}
