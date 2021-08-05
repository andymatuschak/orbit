import { Task } from "@withorbit/core2";

// TODO: probably all this should move to core2.

export const defaultReviewSessionTaskLimit = 50;

export function createReviewQueue(
  dueTasks: Task[],
  thresholdTimestampMillis: number,
  maxTaskCount = defaultReviewSessionTaskLimit,
) {
  const activeTasks = dueTasks.filter((task) => !task.isDeleted);

  const reviewItems: ReviewItem2[] = activeTasks.map((task) =>
    extractReviewItemFromDueTask(task, thresholdTimestampMillis),
  );

  reviewItems.sort((a, b) => {
    // TODO: consistent shuffle by task ID
    return (
      a.task.componentStates[a.componentID].dueTimestampMillis -
      b.task.componentStates[b.componentID].dueTimestampMillis
    );
  });

  return reviewItems.slice(0, maxTaskCount);
}

export interface ReviewItem2 {
  task: Task;
  componentID: string;
}

function extractReviewItemFromDueTask(
  dueTask: Task,
  thresholdTimestampMillis: number,
): ReviewItem2 {
  const dueComponentEntries = Object.entries(dueTask.componentStates).filter(
    ([, componentState]) =>
      componentState.dueTimestampMillis <= thresholdTimestampMillis,
  );
  if (dueComponentEntries.length === 0) {
    throw new Error(
      `Inconsistent: task ${dueTask.id} was provided in set of due tasks, but none of its components are due at threshold ${thresholdTimestampMillis}`,
    );
  }

  if (dueComponentEntries.length > 1) {
    // At most one component of a task can be in the review queue at once, so we choose one.
    const content = dueTask.spec.content;

    function getComponentOrder(id: string): number {
      if (!("components" in content)) {
        throw new Error(
          `Inconsistent: task ${dueTask.id} has multiple due components but no components in its content spec`,
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

    dueComponentEntries.sort(
      (a, b) => getComponentOrder(a[0]) - getComponentOrder(b[0]),
    );
  }

  return { task: dueTask, componentID: dueComponentEntries[0][0] };
}
