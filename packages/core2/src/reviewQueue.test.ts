import { Task } from "./entities/task";
import { testClozeTask } from "./__tests__/testTasks";
import { createReviewQueue } from "./reviewQueue";

describe("cloze task component ordering", () => {
  test("first due component chosen", () => {
    const testTask: Task = {
      ...testClozeTask,
      componentStates: {
        a: { ...testClozeTask.componentStates["a"], dueTimestampMillis: 5 },
        b: { ...testClozeTask.componentStates["b"], dueTimestampMillis: 0 },
      },
    };
    const queue = createReviewQueue([testTask]);
    expect(queue.length).toBe(1);
    expect(queue[0].componentID).toEqual("b");
  });

  test("ties broken by order number", () => {
    const queue = createReviewQueue([testClozeTask]);
    expect(queue.length).toBe(1);
    expect(queue[0].componentID).toEqual("a");
  });
});
