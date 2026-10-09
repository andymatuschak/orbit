import { EntityType } from "../../entity.js";
import type { Task, TaskID } from "../../entities/task.js";
import type { ObservationID } from "../ids.js";
import {
  componentIDsForTaskSpec,
  type OrbitSchedulerPolicy,
  type OrbitVault,
  type SchedulingObservation,
  type VaultTask,
} from "../schema.js";
import { createOrbitSchedulerAdapter } from "./orbitSchedulerAdapter.js";

export interface VaultProjectionIssue {
  kind: "unknown-component";
  observationID: ObservationID;
  taskID: TaskID;
  componentID: string;
}

export interface VaultProjectionSnapshot {
  tasks: ReadonlyMap<TaskID, Task>;
  issues: readonly VaultProjectionIssue[];
  observationCount: number;
}

/** Authoritative Automerge conflicts are rejected by the document adapter. */
export function projectVault(input: {
  document: OrbitVault;
}): VaultProjectionSnapshot {
  return projectResolvedVault({
    policy: input.document.scheduler,
    resolvedTasks: new Map(
      Object.entries(input.document.tasks) as [TaskID, VaultTask][],
    ),
    observations: Object.entries(input.document.observations) as [
      ObservationID,
      SchedulingObservation,
    ][],
  });
}

export function projectResolvedVault(input: {
  policy: OrbitSchedulerPolicy;
  resolvedTasks: ReadonlyMap<TaskID, VaultTask>;
  observations: Iterable<[ObservationID, SchedulingObservation]>;
}): VaultProjectionSnapshot {
  const scheduler = createOrbitSchedulerAdapter(input.policy);
  const issues: VaultProjectionIssue[] = [];
  const tasks = new Map<TaskID, Task>();
  for (const [taskID, task] of input.resolvedTasks) {
    tasks.set(taskID, {
      id: taskID,
      type: EntityType.Task,
      createdAtTimestampMillis: task.createdAtTimestampMillis,
      spec: task.spec,
      provenance: task.provenance,
      metadata: { ...task.metadata },
      isDeleted: task.isDeleted,
      componentStates: Object.fromEntries(
        componentIDsForTaskSpec(task.spec).map((componentID) => [
          componentID,
          scheduler.initialize(task.createdAtTimestampMillis),
        ]),
      ),
    });
  }

  // Fold each component independently in timestamp/ID order. This order is
  // deterministic across devices, regardless of Automerge insertion order.
  const grouped = new Map<string, [ObservationID, SchedulingObservation][]>();
  let observationCount = 0;
  for (const entry of input.observations) {
    observationCount++;
    const key = `${entry[1].taskID}\0${entry[1].componentID}`;
    const entries = grouped.get(key) ?? [];
    entries.push(entry);
    grouped.set(key, entries);
  }
  for (const entries of grouped.values()) {
    entries.sort(
      ([leftID, left], [rightID, right]) =>
        left.occurredAtTimestampMillis - right.occurredAtTimestampMillis ||
        leftID.localeCompare(rightID),
    );
    for (const [observationID, observation] of entries) {
      const task = tasks.get(observation.taskID);
      const oldState = task?.componentStates[observation.componentID];
      if (!task || !oldState) {
        issues.push({
          kind: "unknown-component",
          observationID,
          taskID: observation.taskID,
          componentID: observation.componentID,
        });
        continue;
      }
      task.componentStates[observation.componentID] =
        observation.kind === "review"
          ? scheduler.applyReview(oldState, observation)
          : scheduler.applyReschedule(oldState, observation);
    }
  }
  return {
    tasks,
    issues,
    observationCount,
  };
}
