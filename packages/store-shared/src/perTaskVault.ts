import {
  projectVault,
  type AutomergeDocumentURL,
  type ObservationID,
  type OrbitVault,
  type SchedulingObservation,
  type Task,
  type TaskID,
  type VaultID,
  type VaultTask,
} from "@withorbit/core";

/** Schema-2 policy shared by the JS Automerge and Repo Swift adapters. */
export interface PerTaskCatalogEntry {
  documentURL: AutomergeDocumentURL;
  nextDueTimestampMillis: number;
  isDeleted: boolean;
  indexedTaskHeads: string[];
}

export interface PerTaskDocument {
  vaultID: VaultID;
  taskID: TaskID;
  task: VaultTask;
  observations: Record<ObservationID, SchedulingObservation>;
}

export type PerTaskVaultEnvelope = Pick<
  OrbitVault,
  "vaultID" | "createdAtTimestampMillis" | "scheduler" | "attachments"
>;

export function projectPerTask(
  envelope: PerTaskVaultEnvelope,
  taskDocument: PerTaskDocument,
) {
  return projectVault({
    document: {
      ...envelope,
      tasks: { [taskDocument.taskID]: taskDocument.task },
      observations: taskDocument.observations,
    },
  });
}

export function derivePerTaskCatalogEntry(
  envelope: PerTaskVaultEnvelope,
  documentURL: AutomergeDocumentURL,
  taskDocument: PerTaskDocument,
  indexedTaskHeads: readonly string[],
): PerTaskCatalogEntry {
  const task = projectPerTask(envelope, taskDocument).tasks.get(
    taskDocument.taskID,
  );
  if (!task) throw new Error(`Projection omitted task ${taskDocument.taskID}`);
  const components = Object.values(task.componentStates);
  if (components.length === 0)
    throw new Error(`Task ${taskDocument.taskID} has no components`);
  return {
    documentURL,
    nextDueTimestampMillis: Math.min(
      ...components.map(({ dueTimestampMillis }) => dueTimestampMillis),
    ),
    isDeleted: task.isDeleted,
    indexedTaskHeads: [...indexedTaskHeads].sort(),
  };
}

export function rankActivePerTaskEntries(
  entries: Record<TaskID, PerTaskCatalogEntry>,
): [TaskID, PerTaskCatalogEntry][] {
  return (Object.entries(entries) as [TaskID, PerTaskCatalogEntry][])
    .filter(([, entry]) => !entry.isDeleted)
    .sort(
      ([leftID, left], [rightID, right]) =>
        left.nextDueTimestampMillis - right.nextDueTimestampMillis ||
        leftID.localeCompare(rightID),
    );
}

/** Use authoritative task projections when a selected catalog entry was stale. */
export function rankProjectedPerTaskTasks(tasks: readonly Task[]): Task[] {
  const earliestDue = (task: Task) => {
    const states = Object.values(task.componentStates);
    if (states.length === 0)
      throw new Error(`Task ${task.id} has no components`);
    return Math.min(
      ...states.map(({ dueTimestampMillis }) => dueTimestampMillis),
    );
  };
  return [...tasks].sort(
    (left, right) =>
      earliestDue(left) - earliestDue(right) || left.id.localeCompare(right.id),
  );
}

export function sameTaskHeads(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const sortedRight = [...right].sort();
  return [...left].sort().every((head, index) => head === sortedRight[index]);
}
