import { dateDiffInDays, forgetting_curve } from "ts-fsrs";
import {
  ComponentIDsOf,
  Task,
  TaskComponentState,
  TaskContent,
} from "./entities/task.js";
import type { SchedulerPolicy } from "./vault/schema.js";

export interface ReviewItem<TC extends TaskContent = TaskContent> {
  task: Task<TC>;
  componentID: ComponentIDsOf<TC>;
}

export const defaultReviewSessionMaximumQueueSize = 50;

export interface ReviewCandidatePriority {
  id: string;
  dueTimestampMillis: number;
  memory?: Pick<
    NonNullable<TaskComponentState["fsrs"]>,
    "stability" | "lastReviewTimestampMillis" | "isRetry"
  > | null;
}

export interface ReviewCandidateSelectionOptions {
  scheduler?: SchedulerPolicy;
  nowTimestampMillis: number;
  maximumCount: number;
  /** Saved reviews since FSRS cutover rotate the starting lane after each review. */
  reviewCount?: number;
}

/**
 * Use the same selection for materialized tasks and lightweight catalog rows.
 * FSRS balances inexpensive maintenance with progress through neglected cards;
 * no estimated recall value or separate queue cursor needs to be persisted.
 */
export function selectReviewCandidates<T>(
  candidates: readonly T[],
  priorityOf: (candidate: T) => ReviewCandidatePriority,
  options: ReviewCandidateSelectionOptions,
): T[] {
  const maximumCount = Math.max(0, Math.floor(options.maximumCount));
  if (maximumCount === 0) return [];
  const priorities = candidates.map((candidate) => ({
    candidate,
    ...priorityOf(candidate),
  }));
  const scheduler = options.scheduler;
  if (scheduler?.kind !== "fsrs") {
    // Legacy callers already choose their own due-time threshold. Keep both
    // that boundary and stable input ordering for equal due times unchanged.
    return priorities
      .sort((a, b) => a.dueTimestampMillis - b.dueTimestampMillis)
      .slice(0, maximumCount)
      .map(({ candidate }) => candidate);
  }

  const now = options.nowTimestampMillis;
  const oldestFirst = (
    a: ReviewCandidatePriority,
    b: ReviewCandidatePriority,
  ) =>
    a.dueTimestampMillis - b.dueTimestampMillis ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  // One representative per task, even if the caller accidentally supplies it
  // twice. The earliest component's due time also defines its memory estimate.
  const unique = new Map<string, (typeof priorities)[number]>();
  for (const priority of priorities) {
    if (
      !isReviewDue(priority.dueTimestampMillis, now, priority.memory?.isRetry)
    ) {
      continue;
    }
    const previous = unique.get(priority.id);
    if (!previous || oldestFirst(priority, previous) < 0) {
      unique.set(priority.id, priority);
    }
  }

  const eligible = [...unique.values()];
  const retries = eligible
    .filter((priority) => priority.memory?.isRetry)
    .sort(oldestFirst);
  const oldest = eligible
    .filter((priority) => !priority.memory?.isRetry)
    .sort(oldestFirst);
  const highestRecall = oldest
    .flatMap((priority) => {
      const memory = priority.memory;
      if (
        !memory ||
        !Number.isFinite(memory.stability) ||
        memory.stability <= 0 ||
        !Number.isFinite(memory.lastReviewTimestampMillis)
      ) {
        return [];
      }
      const elapsed = Math.max(
        0,
        dateDiffInDays(
          new Date(memory.lastReviewTimestampMillis),
          new Date(now),
        ),
      );
      return [
        {
          ...priority,
          retrievability: forgetting_curve(
            scheduler.weights,
            elapsed,
            memory.stability,
          ),
        },
      ];
    })
    .sort((a, b) => b.retrievability - a.retrievability || oldestFirst(a, b));

  const selected = retries.slice(0, maximumCount);
  const selectedIDs = new Set(selected.map(({ id }) => id));
  let highIndex = 0;
  let oldIndex = 0;
  let chooseHighestRecall = (options.reviewCount ?? 0) % 2 === 0;
  while (selected.length < maximumCount) {
    while (
      highestRecall[highIndex] &&
      selectedIDs.has(highestRecall[highIndex].id)
    ) {
      highIndex++;
    }
    while (oldest[oldIndex] && selectedIDs.has(oldest[oldIndex].id)) {
      oldIndex++;
    }
    const next = chooseHighestRecall
      ? (highestRecall[highIndex++] ?? oldest[oldIndex++])
      : (oldest[oldIndex++] ?? highestRecall[highIndex++]);
    if (!next) break;
    selected.push(next);
    selectedIDs.add(next.id);
    chooseHighestRecall = !chooseHighestRecall;
  }
  return selected.map(({ candidate }) => candidate);
}

export function createReviewQueue(
  dueTasks: Task[],
  maximumQueueSize = defaultReviewSessionMaximumQueueSize,
  options: {
    scheduler?: SchedulerPolicy;
    nowTimestampMillis?: number;
    reviewCount?: number;
  } = {},
): ReviewItem[] {
  const activeTasks = dueTasks.filter((task) => !task.isDeleted);

  const reviewItems: ReviewItem[] = activeTasks.map((task) =>
    extractReviewItemFromDueTask(task),
  );

  return selectReviewCandidates(
    reviewItems,
    ({ task, componentID }) => ({
      id: task.id,
      dueTimestampMillis: task.componentStates[componentID].dueTimestampMillis,
      memory: task.componentStates[componentID].fsrs,
    }),
    {
      ...options,
      nowTimestampMillis: options.nowTimestampMillis ?? Date.now(),
      maximumCount: maximumQueueSize,
    },
  );
}

/**
 * In practice, when creating a review queue, we usually want to show not only tasks which are due now, but also those which will become due before the user's next likely practice. That is, if a task is going to become due later today, and I'm reviewing now, we should just review it now. This function returns a "fuzzy" due timestamp threshold to use when fetching tasks for the review queue.
 */
export function getReviewQueueFuzzyDueTimestampThreshold(
  nowMillis: number = Date.now(),
): number {
  return nowMillis + 1000 * 60 * 60 * 16; // 16 hour lookahead
}

/** Short retries must wait their actual delay, including app-local refills. */
export function isReviewDue(
  dueTimestampMillis: number,
  nowTimestampMillis = Date.now(),
  isRetry = false,
): boolean {
  return (
    dueTimestampMillis <=
    (isRetry
      ? nowTimestampMillis
      : getReviewQueueFuzzyDueTimestampThreshold(nowTimestampMillis))
  );
}

export function extractReviewItemFromDueTask(dueTask: Task): ReviewItem {
  const componentStateEntries = Object.entries(dueTask.componentStates);
  if (componentStateEntries.length === 0) {
    throw new Error(`Inconsistent: task ${dueTask.id} has no component states`);
  }

  const content = dueTask.spec.content;

  function getComponentOrder(id: string): number {
    if (!("components" in content)) {
      throw new Error(
        `Inconsistent: task ${dueTask.id} has multiple components due at the same time but no components in its content spec`,
      );
    }
    const componentContent = content.components[id];
    if (!componentContent) {
      throw new Error(
        `Inconsistent: task ${dueTask.id} has unknown due component ${id}`,
      );
    }
    return componentContent.order;
  }

  // Take the first by due time; if there are multiple with the same due time, use `order` to break ties.
  componentStateEntries.sort((a, b) => {
    if (a[1].dueTimestampMillis === b[1].dueTimestampMillis) {
      return getComponentOrder(a[0]) - getComponentOrder(b[0]);
    } else {
      return a[1].dueTimestampMillis - b[1].dueTimestampMillis;
    }
  });

  return { task: dueTask, componentID: componentStateEntries[0][0] };
}
