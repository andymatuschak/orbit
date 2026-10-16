import {
  extractReviewItemFromDueTask,
  getReviewQueueFuzzyDueTimestampThreshold,
  projectVault,
  selectReviewCandidates,
  type AutomergeDocumentURL,
  type ObservationID,
  type OrbitVault,
  type ReviewCandidatePriority,
  type ReviewCandidateSelectionOptions,
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
  /** Rebuildable queue priority; task observations remain authoritative. */
  fsrs?: {
    reviewCount: number;
    memory: NonNullable<ReviewCandidatePriority["memory"]> | null;
  };
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
  projectedTask?: Task,
): PerTaskCatalogEntry {
  const task =
    projectedTask ??
    projectPerTask(envelope, taskDocument).tasks.get(taskDocument.taskID);
  if (!task) throw new Error(`Projection omitted task ${taskDocument.taskID}`);
  const { componentID } = extractReviewItemFromDueTask(task);
  const state = task.componentStates[componentID];
  const scheduler = envelope.scheduler;
  return {
    documentURL,
    nextDueTimestampMillis: state.dueTimestampMillis,
    isDeleted: task.isDeleted,
    indexedTaskHeads: [...indexedTaskHeads].sort(),
    ...(scheduler.kind === "fsrs"
      ? {
          fsrs: {
            reviewCount: Object.values(taskDocument.observations).filter(
              (observation) =>
                observation.kind === "review" &&
                observation.occurredAtTimestampMillis >=
                  scheduler.cutoverTimestampMillis,
            ).length,
            memory: state.fsrs
              ? {
                  stability: state.fsrs.stability,
                  lastReviewTimestampMillis:
                    state.fsrs.lastReviewTimestampMillis,
                  ...(state.fsrs.isRetry ? { isRetry: true as const } : {}),
                }
              : null,
          },
        }
      : {}),
  };
}

export function selectPerTaskReviewEntries(
  entries: Record<TaskID, PerTaskCatalogEntry>,
  options: ReviewCandidateSelectionOptions,
): [TaskID, PerTaskCatalogEntry][] {
  const threshold = getReviewQueueFuzzyDueTimestampThreshold(
    options.nowTimestampMillis,
  );
  const candidates = (
    Object.entries(entries) as [TaskID, PerTaskCatalogEntry][]
  ).filter(
    ([, entry]) =>
      !entry.isDeleted && entry.nextDueTimestampMillis <= threshold,
  );
  // Legacy selection preserves input order on equal due times; the catalog's
  // historical tie-breaker is task ID rather than map insertion order.
  if (options.scheduler?.kind !== "fsrs")
    candidates.sort(([leftID], [rightID]) => leftID.localeCompare(rightID));
  return selectReviewCandidates(
    candidates,
    ([id, entry]) => ({
      id,
      dueTimestampMillis: entry.nextDueTimestampMillis,
      memory: entry.fsrs?.memory,
    }),
    options,
  );
}
