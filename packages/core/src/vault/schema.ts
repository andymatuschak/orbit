import type {
  AttachmentID,
  AttachmentMIMEType,
} from "../entities/attachmentReference.js";
import {
  mainTaskComponentID,
  type TaskRepetitionOutcome,
  type TaskID,
  type TaskProvenance,
  type TaskSpec,
} from "../entities/task.js";
import type {
  AttachmentSHA256,
  AutomergeDocumentURL,
  ObservationID,
  VaultID,
} from "./ids.js";

export interface OrbitSchedulerPolicy {
  kind: "orbit-sm2-like";
  version: 1;
  intervalGrowthFactor: number;
  initialReviewIntervalMillis: number;
}

/** FSRS-6; the cutover changes future reviews, not already scheduled dates. */
export interface FSRSSchedulerPolicy {
  kind: "fsrs";
  version: 1;
  modelVersion: 6;
  weights: number[];
  requestedRetention: number;
  cutoverTimestampMillis: number;
  previousPolicy: OrbitSchedulerPolicy;
}

export type SchedulerPolicy = OrbitSchedulerPolicy | FSRSSchedulerPolicy;

export interface VaultTask {
  createdAtTimestampMillis: number;
  spec: TaskSpec;
  provenance: TaskProvenance | null;
  metadata: Record<string, string>;
  isDeleted: boolean;
}

interface SchedulingObservationBase {
  taskID: TaskID;
  componentID: string;
  occurredAtTimestampMillis: number;
}

export interface ReviewObservation extends SchedulingObservationBase {
  kind: "review";
  reviewSessionID: string | null;
  outcome: TaskRepetitionOutcome;
}

export interface RescheduleObservation extends SchedulingObservationBase {
  kind: "reschedule";
  newDueTimestampMillis: number;
}

export type SchedulingObservation = ReviewObservation | RescheduleObservation;

export interface VaultAttachment {
  hash: AttachmentSHA256;
  documentURL: AutomergeDocumentURL;
  mediaType: AttachmentMIMEType;
  byteLength: number;
}

/** In-memory scheduling input, not a persisted Automerge document format. */
export interface OrbitVault {
  vaultID: VaultID;
  createdAtTimestampMillis: number;
  scheduler: SchedulerPolicy;
  tasks: Record<TaskID, VaultTask>;
  observations: Record<ObservationID, SchedulingObservation>;
  attachments: Record<AttachmentID, VaultAttachment>;
}

export interface OrbitAttachmentDocument {
  documentType: "com.withorbit.attachment";
  schemaVersion: 1;
  bytes: Uint8Array;
}

export const defaultOrbitSchedulerPolicy: OrbitSchedulerPolicy = {
  kind: "orbit-sm2-like",
  version: 1,
  intervalGrowthFactor: 2.3,
  initialReviewIntervalMillis: 5 * 24 * 60 * 60 * 1_000,
};

export function componentIDsForTaskSpec(spec: TaskSpec): string[] {
  return (
    "components" in spec.content
      ? Object.keys(spec.content.components)
      : [mainTaskComponentID]
  ).sort();
}

export function referencedAttachmentIDs(spec: TaskSpec): AttachmentID[] {
  const references = new Set<AttachmentID>(spec.content.body.attachments);
  if ("answer" in spec.content) {
    for (const attachmentID of spec.content.answer.attachments) {
      references.add(attachmentID);
    }
  }
  return [...references].sort();
}
