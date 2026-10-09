import {
  EventType,
  type Event,
  type EventID,
  type VaultMutation,
} from "@withorbit/core";

/** The only remaining new-to-legacy adapter, used by unmigrated accounts. */
export function legacyEventsForMutations(
  mutations: readonly VaultMutation[],
  nowTimestampMillis = Date.now(),
): Event[] {
  return mutations.flatMap((mutation): Event[] => {
    const id = legacyEventID(mutation.mutationID);
    switch (mutation.kind) {
      case "ingestTask":
        return [
          {
            type: EventType.TaskIngest,
            id,
            entityID: mutation.task.taskID,
            timestampMillis: mutation.task.createdAtTimestampMillis,
            spec: mutation.task.spec,
            provenance: mutation.task.provenance,
            metadata: mutation.task.metadata,
          },
        ];
      case "updateTaskSpec":
        return [
          {
            type: EventType.TaskUpdateSpecEvent,
            id,
            entityID: mutation.taskID,
            timestampMillis: nowTimestampMillis,
            spec: mutation.spec,
          },
        ];
      case "updateTaskProvenance":
        return [
          {
            type: EventType.TaskUpdateProvenanceEvent,
            id,
            entityID: mutation.taskID,
            timestampMillis: nowTimestampMillis,
            provenance: mutation.provenance,
          },
        ];
      case "mergeTaskMetadata":
        return [
          {
            type: EventType.TaskUpdateMetadataEvent,
            id,
            entityID: mutation.taskID,
            timestampMillis: nowTimestampMillis,
            metadata: mutation.metadata,
          },
        ];
      case "setTaskDeleted":
        return [
          {
            type: EventType.TaskUpdateDeleted,
            id,
            entityID: mutation.taskID,
            timestampMillis: nowTimestampMillis,
            isDeleted: mutation.isDeleted,
          },
        ];
      case "recordReview":
        if (mutation.taskSeed) {
          throw new Error(
            "Legacy review writes must ingest a task as a separate mutation",
          );
        }
        requireMatchingObservationID(mutation.observationID, id);
        return [
          {
            type: EventType.TaskRepetition,
            id,
            entityID: mutation.taskID,
            componentID: mutation.componentID,
            reviewSessionID: mutation.reviewSessionID ?? "unknown",
            outcome: mutation.outcome,
            timestampMillis: mutation.occurredAtTimestampMillis,
          },
        ];
      case "reschedule":
        requireMatchingObservationID(mutation.observationID, id);
        return [
          {
            type: EventType.TaskReschedule,
            id,
            entityID: mutation.taskID,
            componentID: mutation.componentID,
            newDueTimestampMillis: mutation.newDueTimestampMillis,
            timestampMillis: mutation.occurredAtTimestampMillis,
          },
        ];
      case "registerAttachment":
        throw new Error(
          "Attachment bytes must be written through the legacy store",
        );
    }
  });
}

function legacyEventID(mutationID: string): EventID {
  const match = /(?:^|\/)([0-9A-Za-z_-]{22})$/.exec(mutationID);
  if (!match) {
    throw new Error("Legacy mutations require a stable legacy event ID");
  }
  return match[1] as EventID;
}

function requireMatchingObservationID(observationID: string, eventID: EventID) {
  if (!observationID.endsWith(`/${eventID}`)) {
    throw new Error("Legacy mutation and observation IDs do not match");
  }
}
