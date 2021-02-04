// Given some time might be computing whether a user has a session due, we evaluate whether cards are due using a date slightly shifted into the future, to find the cards that'd be due on that conceptual day.
import { PromptID } from "../dist";
import { PromptState } from "./promptState";
import { clozePromptType } from "./types/prompt";
import {
  getPromptTaskForID,
  PromptTask,
  PromptTaskID,
} from "./types/promptTask";

export function getReviewSessionCardLimit(): number {
  return 50;
}

export function getFuzzyDueTimestampThreshold(nowMillis: number): number {
  return nowMillis + 1000 * 60 * 60 * 16; // 16 hour lookahead
}

export function getDuePromptTasks({
  promptStates,
  thresholdTimestampMillis,
  maxCardsInSession = getReviewSessionCardLimit(),
}: {
  promptStates: ReadonlyMap<PromptTaskID, PromptState>;
  thresholdTimestampMillis: number;
  maxCardsInSession?: number;
}): PromptTaskID[] {
  const duePromptTaskIDs = [...promptStates.keys()].filter((promptTask) => {
    const promptState = promptStates.get(promptTask)!;
    return (
      promptState.dueTimestampMillis <= thresholdTimestampMillis &&
      !promptState.taskMetadata.isDeleted
    );
  });

  duePromptTaskIDs.sort((a, b) => {
    const promptStateA = promptStates.get(a)!;
    const promptStateB = promptStates.get(b)!;

    // TODO: consistent shuffle by task ID
    return promptStateA.dueTimestampMillis - promptStateB.dueTimestampMillis;
  });

  // Only allow one task per cloze prompt.
  const occupiedPromptIDs: Set<PromptID> = new Set();
  const filteredTaskIDs: PromptTaskID[] = [];
  for (const taskID of duePromptTaskIDs) {
    const promptTask = getPromptTaskForID(taskID);
    if (promptTask instanceof Error) throw promptTask;
    if (promptTask.promptType === clozePromptType) {
      if (!occupiedPromptIDs.has(promptTask.promptID)) {
        occupiedPromptIDs.add(promptTask.promptID);
        filteredTaskIDs.push(taskID);
      }
    } else {
      filteredTaskIDs.push(taskID);
    }
  }

  return (
    filteredTaskIDs
      // Apply our review cap.
      .slice(0, maxCardsInSession)
  );
}
