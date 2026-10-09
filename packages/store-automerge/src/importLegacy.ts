import {
  componentIDsForTaskSpec,
  defaultOrbitSchedulerPolicy,
  EventType,
  type AttachmentID,
  type AttachmentMIMEType,
  type Event,
  type ObservationID,
  type Task,
  type VaultID,
  type OrbitVault,
} from "@withorbit/core";
import { AutomergeAttachmentWriter } from "./attachmentWriter.js";
import type { AutomergeBinaryStorage } from "./binaryStorage.js";
import { canonicalJSONString } from "@withorbit/store-shared/taskMutationPlanner";
import { legacyObservationID } from "./legacyEventCompatibility.js";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { BinaryPerTaskDocuments } from "./repoPerTaskDocuments.js";

export interface LegacyAttachmentInput {
  attachmentID: AttachmentID;
  bytes: Uint8Array;
  mediaType: AttachmentMIMEType;
}

export interface LegacyVaultImportInput {
  tasks: readonly Task[];
  events: readonly Event[];
  attachments: readonly LegacyAttachmentInput[];
  /** Stable source order used only to break equal-timestamp observations. */
  eventSequenceNumbers?: ReadonlyMap<Event["id"], number>;
}

export interface LegacyVaultImportStatistics {
  taskCount: number;
  eventCount: number;
  attachmentCount: number;
  observationCount: number;
  removedComponentObservationCount: number;
}

/** Builds the server migration directly in schema 2, without interim shards. */
export async function createPerTaskVaultFromLegacy(input: {
  storage: AutomergeBinaryStorage;
  vaultID: VaultID;
  createdAtTimestampMillis: number;
  legacy: LegacyVaultImportInput;
}): Promise<{
  vault: PerTaskRepository;
  statistics: LegacyVaultImportStatistics;
}> {
  assertLegacyTasks(input.legacy.tasks);
  const attachmentWriter = new AutomergeAttachmentWriter(input.storage);
  const attachments: OrbitVault["attachments"] = {};
  for (const attachment of input.legacy.attachments) {
    const prepared = await attachmentWriter.prepare({
      attachmentID: attachment.attachmentID,
      bytes: attachment.bytes,
      mediaTypeHint: attachment.mediaType,
    });
    attachments[attachment.attachmentID] = prepared.catalogEntry;
  }
  const observations: OrbitVault["observations"] = {};
  for (const event of input.legacy.events) {
    if (
      event.type !== EventType.TaskRepetition &&
      event.type !== EventType.TaskReschedule
    ) {
      continue;
    }
    const observationID = legacyObservationID(
      event.id,
      input.legacy.eventSequenceNumbers?.get(event.id),
    ) as ObservationID;
    if (observations[observationID]) {
      throw new Error("Legacy observation IDs are not unique");
    }
    observations[observationID] =
      event.type === EventType.TaskRepetition
        ? {
            kind: "review",
            taskID: event.entityID,
            componentID: event.componentID,
            reviewSessionID: event.reviewSessionID ?? null,
            outcome: event.outcome,
            occurredAtTimestampMillis: event.timestampMillis,
          }
        : {
            kind: "reschedule",
            taskID: event.entityID,
            componentID: event.componentID,
            occurredAtTimestampMillis: event.timestampMillis,
            newDueTimestampMillis: event.newDueTimestampMillis,
          };
  }
  const logical: OrbitVault = {
    vaultID: input.vaultID,
    createdAtTimestampMillis: input.createdAtTimestampMillis,
    scheduler: defaultOrbitSchedulerPolicy,
    tasks: Object.fromEntries(
      input.legacy.tasks.map((task) => [
        task.id,
        {
          createdAtTimestampMillis: task.createdAtTimestampMillis,
          spec: task.spec,
          provenance: task.provenance,
          metadata: task.metadata,
          isDeleted: task.isDeleted,
        },
      ]),
    ),
    observations,
    attachments,
  };
  const vault = await PerTaskRepository.create(
    new BinaryPerTaskDocuments(input.storage),
    logical,
  );
  const projection = await vault.getProjection();
  const expectedTasks = [...input.legacy.tasks]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((task) => [task.id, task]);
  const actualTasks = [...projection.tasks]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([taskID, task]) => [taskID, task]);
  if (canonicalJSONString(actualTasks) !== canonicalJSONString(expectedTasks)) {
    throw new Error(
      "Legacy vault projection does not match legacy task snapshots",
    );
  }
  return {
    vault,
    statistics: {
      taskCount: projection.tasks.size,
      eventCount: input.legacy.events.length,
      attachmentCount: input.legacy.attachments.length,
      observationCount: projection.observationCount,
      removedComponentObservationCount: projection.issues.filter(
        ({ kind }) => kind === "unknown-component",
      ).length,
    },
  };
}

function assertLegacyTasks(tasks: readonly Task[]) {
  for (const task of tasks) {
    const derived = componentIDsForTaskSpec(task.spec);
    const stored = Object.keys(task.componentStates).sort();
    if (derived.join("\0") !== stored.join("\0")) {
      throw new Error(
        `Legacy component-ID invariant failed for task ${task.id}`,
      );
    }
    for (const componentID of stored) {
      if (
        task.componentStates[componentID].createdAtTimestampMillis !==
        task.createdAtTimestampMillis
      ) {
        throw new Error(
          `Legacy component creation-time invariant failed for task ${task.id}`,
        );
      }
    }
  }
}
