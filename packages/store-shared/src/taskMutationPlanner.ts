import {
  componentIDsForTaskSpec,
  referencedAttachmentIDs,
  type ObservationID,
  type SchedulingObservation,
  type TaskSpec,
  type VaultMutation,
  type VaultTask,
} from "@withorbit/core";
import type { DocumentPatch } from "./perTaskRepository.js";
import type { PerTaskVaultTask, PerTaskVaultRoot } from "./perTaskCodec.js";

export type TaskMutation = Exclude<
  VaultMutation,
  { kind: "registerAttachment" }
>;
/** Plans only this authoritative task; the repository writes its catalog after durability. */
export function planMutationsForTask(input: {
  document: PerTaskVaultTask;
  attachments: PerTaskVaultRoot["attachments"];
  mutations: readonly TaskMutation[];
}): { document: PerTaskVaultTask; patches: DocumentPatch[] } {
  const task = {
    ...input.document.task,
    metadata: { ...input.document.task.metadata },
  };
  const observations = { ...input.document.observations };

  for (const mutation of input.mutations) {
    const taskID =
      mutation.kind === "ingestTask" ? mutation.task.taskID : mutation.taskID;
    if (taskID !== input.document.taskID)
      throw new Error("Mutation belongs to a different task document");
    switch (mutation.kind) {
      case "ingestTask": {
        const seed = mutation.task;
        task.createdAtTimestampMillis = Math.min(
          task.createdAtTimestampMillis,
          seed.createdAtTimestampMillis,
        );
        if (seed.provenance !== null) task.provenance = seed.provenance;
        Object.assign(task.metadata, seed.metadata ?? {});
        task.isDeleted = false;
        break;
      }
      case "updateTaskSpec": {
        if (
          componentIDsForTaskSpec(task.spec).join("\0") !==
          componentIDsForTaskSpec(mutation.spec).join("\0")
        ) {
          throw new Error("Vault cannot change component IDs");
        }
        assertAttachmentsRegistered(input.attachments, mutation.spec);
        task.spec = mutation.spec;
        break;
      }
      case "updateTaskProvenance":
        task.provenance = mutation.provenance;
        break;
      case "mergeTaskMetadata":
        Object.assign(task.metadata, mutation.metadata);
        break;
      case "setTaskDeleted":
        task.isDeleted = mutation.isDeleted;
        break;
      case "recordReview":
        if (mutation.taskSeed) {
          if (mutation.taskSeed.taskID !== mutation.taskID) {
            throw new Error("Review task seed does not match its task ID");
          }
        }
        assertAttachmentsRegistered(input.attachments, task.spec);
        putObservation(
          mutation.observationID,
          {
            kind: "review",
            taskID,
            componentID: mutation.componentID,
            reviewSessionID: mutation.reviewSessionID,
            outcome: mutation.outcome,
            occurredAtTimestampMillis: mutation.occurredAtTimestampMillis,
          },
          observations,
        );
        break;
      case "reschedule":
        assertAttachmentsRegistered(input.attachments, task.spec);
        putObservation(
          mutation.observationID,
          {
            kind: "reschedule",
            taskID,
            componentID: mutation.componentID,
            occurredAtTimestampMillis: mutation.occurredAtTimestampMillis,
            newDueTimestampMillis: mutation.newDueTimestampMillis,
          },
          observations,
        );
        break;
    }
  }

  const before = encodeTask(input.document.task);
  const after = encodeTask(task);
  const patches: DocumentPatch[] = [];
  for (const key of [
    "createdAtTimestampMillis",
    "spec",
    "provenance",
    "isDeleted",
  ] as const) {
    if (before[key] !== after[key])
      patches.push({ kind: "put", path: ["task", key], value: after[key] });
  }
  for (const [key, value] of Object.entries(after.metadata)) {
    if (before.metadata[key] !== value)
      patches.push({ kind: "put", path: ["task", "metadata", key], value });
  }
  for (const id of Object.keys(observations).sort() as ObservationID[]) {
    if (!input.document.observations[id])
      patches.push({
        kind: "put",
        path: ["observations", id],
        value: packObservation(observations[id]),
      });
  }
  return { document: { ...input.document, task, observations }, patches };
}

export function encodeTask(task: VaultTask) {
  return {
    createdAtTimestampMillis: task.createdAtTimestampMillis,
    spec: canonicalJSONString(task.spec),
    provenance:
      task.provenance === null ? null : canonicalJSONString(task.provenance),
    metadata: Object.fromEntries(
      Object.entries(task.metadata).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    isDeleted: task.isDeleted,
  };
}

export function packObservation(observation: SchedulingObservation): string {
  return canonicalJSONString(
    observation.kind === "review"
      ? [
          "r",
          observation.taskID,
          observation.componentID,
          observation.occurredAtTimestampMillis,
          observation.reviewSessionID,
          observation.outcome,
        ]
      : [
          "s",
          observation.taskID,
          observation.componentID,
          observation.occurredAtTimestampMillis,
          observation.newDueTimestampMillis,
        ],
  );
}

export function canonicalJSONString(value: unknown): string {
  return JSON.stringify(sortForJSON(value));
}

function putObservation(
  observationID: ObservationID,
  observation: SchedulingObservation,
  observations: Record<ObservationID, SchedulingObservation>,
) {
  const existing = observations[observationID];
  if (existing) {
    if (canonicalJSONString(existing) !== canonicalJSONString(observation)) {
      throw new Error("Observation ID already has divergent content");
    }
    return;
  }
  observations[observationID] = observation;
}

function assertAttachmentsRegistered(
  attachments: PerTaskVaultRoot["attachments"],
  spec: TaskSpec,
) {
  for (const attachmentID of referencedAttachmentIDs(spec)) {
    if (!attachments[attachmentID]) {
      throw new Error(`Attachment ${attachmentID} is not registered`);
    }
  }
}

function sortForJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJSON);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortForJSON(entry)]),
    );
  }
  return value;
}
