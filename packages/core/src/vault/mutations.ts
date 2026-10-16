import type {
  AttachmentID,
  AttachmentMIMEType,
} from "../entities/attachmentReference.js";
import type { TaskID, TaskProvenance, TaskSpec } from "../entities/task.js";
import type { TaskRepetitionOutcome } from "../entities/task.js";
import type { ObservationID, VaultMutationID } from "./ids.js";
import type { VaultAttachment } from "./schema.js";

export interface TaskSeedInput {
  taskID: TaskID;
  createdAtTimestampMillis: number;
  spec: TaskSpec;
  provenance: TaskProvenance | null;
  metadata?: Record<string, string>;
}

export type VaultMutation =
  | {
      kind: "ingestTask";
      mutationID: VaultMutationID;
      task: TaskSeedInput;
    }
  | {
      kind: "registerAttachment";
      mutationID: VaultMutationID;
      attachmentID: AttachmentID;
      attachment: VaultAttachment;
    }
  | {
      kind: "updateTaskSpec";
      mutationID: VaultMutationID;
      taskID: TaskID;
      spec: TaskSpec;
    }
  | {
      kind: "updateTaskProvenance";
      mutationID: VaultMutationID;
      taskID: TaskID;
      provenance: TaskProvenance | null;
    }
  | {
      kind: "mergeTaskMetadata";
      mutationID: VaultMutationID;
      taskID: TaskID;
      metadata: Record<string, string>;
    }
  | {
      kind: "setTaskDeleted";
      mutationID: VaultMutationID;
      taskID: TaskID;
      isDeleted: boolean;
    }
  | {
      kind: "recordReview";
      mutationID: VaultMutationID;
      taskID: TaskID;
      taskSeed?: TaskSeedInput;
      observationID: ObservationID;
      componentID: string;
      reviewSessionID: string | null;
      outcome: TaskRepetitionOutcome;
      occurredAtTimestampMillis: number;
    }
  | {
      kind: "reschedule";
      mutationID: VaultMutationID;
      observationID: ObservationID;
      taskID: TaskID;
      componentID: string;
      occurredAtTimestampMillis: number;
      newDueTimestampMillis: number;
    };

export interface VaultWriter {
  /** Resolves only after the accepted mutations are durably stored locally. */
  apply(mutations: readonly VaultMutation[]): Promise<void>;
}

export interface PreparedAttachment {
  attachmentID: AttachmentID;
  catalogEntry: VaultAttachment;
}

export interface VaultAttachmentWriter {
  prepare(input: {
    attachmentID: AttachmentID;
    bytes: Uint8Array;
    mediaTypeHint?: AttachmentMIMEType;
  }): Promise<PreparedAttachment>;
}
