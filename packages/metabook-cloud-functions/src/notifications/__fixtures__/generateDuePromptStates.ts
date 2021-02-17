import * as dateFns from "date-fns";
import {
  getIDForPromptTask,
  PromptID,
  PromptState,
  PromptTaskID,
  qaPromptType,
} from "metabook-core";

let globalCounter = 0;

export function generateDuePromptStates(
  baseTimestampMillis: number,
  count: number,
  dueInDays: number,
  intervalDays: number,
): Map<PromptTaskID, PromptState> {
  const output: Map<PromptTaskID, PromptState> = new Map();
  for (let i = 0; i < count; i++) {
    globalCounter++;
    output.set(
      getIDForPromptTask({
        promptType: qaPromptType,
        promptParameters: null,
        promptID: `${globalCounter}` as PromptID,
      }),
      {
        intervalMillis: intervalDays * 1000 * 60 * 60 * 24,
        dueTimestampMillis: dateFns
          .addDays(baseTimestampMillis, dueInDays)
          .valueOf(),
        taskMetadata: {
          isDeleted: false,
        },
      } as PromptState,
    );
  }
  return output;
}
