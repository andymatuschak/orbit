import { generateUniqueID, Task } from "@withorbit/core";
import { createTestTask } from "@withorbit/sample-data";
import * as dateFns from "date-fns";

export function generateDueTasks(
  baseTimestampMillis: number,
  count: number,
  dueInDays: number,
  intervalDays: number,
): Task[] {
  const output: Task[] = [];
  for (let i = 0; i < count; i++) {
    output.push(
      createTestTask({
        id: generateUniqueID(),
        dueTimestampMillis: dateFns
          .addDays(baseTimestampMillis, dueInDays)
          .valueOf(),
        intervalMillis: intervalDays * 1000 * 60 * 60 * 24,
      }),
    );
  }
  return output;
}
