import { ComponentIDsOf, Task, TaskContent } from "./entities/task.js";

export interface ReviewItem<TC extends TaskContent = TaskContent> {
  task: Task<TC>;
  componentID: ComponentIDsOf<TC>;
}

export const defaultReviewSessionMaximumQueueSize = 50;

export function createReviewQueue(
  dueTasks: Task[],
  maximumQueueSize = defaultReviewSessionMaximumQueueSize,
): ReviewItem[] {
  const activeTasks = dueTasks.filter((task) => !task.isDeleted);

  const reviewItems: ReviewItem[] = activeTasks.map((task) =>
    extractReviewItemFromDueTask(task),
  );

  reviewItems.sort((a, b) => {
    // TODO: consistent shuffle by task ID
    return (
      a.task.componentStates[a.componentID].dueTimestampMillis -
      b.task.componentStates[b.componentID].dueTimestampMillis
    );
  });

  return reviewItems.slice(0, maximumQueueSize);
}

/**
 * In practice, when creating a review queue, we usually want to show not only tasks which are due now, but also those which will become due before the user's next likely practice. That is, if a task is going to become due later today, and I'm reviewing now, we should just review it now. This function returns a "fuzzy" due timestamp threshold to use when fetching tasks for the review queue.
 */
export function getReviewQueueFuzzyDueTimestampThreshold(
  nowMillis: number = Date.now(),
): number {
  return nowMillis + 1000 * 60 * 60 * 16; // 16 hour lookahead
}

function extractReviewItemFromDueTask(dueTask: Task): ReviewItem {
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
