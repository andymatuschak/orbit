import {
  maximumAttachmentByteLength,
  type AttachmentID,
  type AttachmentMIMEType,
  type Task,
  type TaskID,
  type TaskRepetitionOutcome,
  type TaskSeedInput,
} from "@withorbit/core";

// The embed keeps page-memory progress, not a Repo or a durable outbox. These
// bounded HTTP requests submit intent to the same vault used by ordinary peers.
export const maximumEmbeddedReviewBatchSize = 100;
export const maximumEmbeddedAttachmentBytes = maximumAttachmentByteLength;
export const maximumEmbeddedReviewBodyBytes =
  Math.ceil(maximumEmbeddedAttachmentBytes / 3) * 4 + 512 * 1024;

export interface EmbeddedReviewSubmission {
  requestID: string;
  sessionID: string;
  taskID: TaskID;
  componentID: string;
  outcome: TaskRepetitionOutcome;
  occurredAtTimestampMillis: number;
  taskSeed: TaskSeedInput;
}

export interface EmbeddedInlineAttachment {
  attachmentID: AttachmentID;
  mediaTypeHint?: AttachmentMIMEType;
  bytesBase64: string;
}

export interface EmbeddedReviewBatch {
  reviews: EmbeddedReviewSubmission[];
  attachments?: EmbeddedInlineAttachment[];
}

export interface EmbeddedProjectionResponse {
  tasks: Task[];
}

export interface EmbeddedReviewResponse extends EmbeddedProjectionResponse {
  acceptedRequestIDs: string[];
}
