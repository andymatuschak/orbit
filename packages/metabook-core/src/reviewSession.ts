// Given some time might be computing whether a user has a session due, we evaluate whether cards are due using a date slightly shifted into the future, to find the cards that'd be due on that conceptual day.
import { PromptState } from "./promptState";
import { PromptTask, PromptTaskID } from "./types/promptTask";

export function getReviewSessionCardLimit(): number {
  return 50;
}

export function getFuzzyDueTimestampThreshold(nowMillis: number): number {
  return nowMillis + 1000 * 60 * 60 * 16; // 16 hour lookahead
}

export function getDuePromptTasks({
  promptStates,
  thresholdTimestampMillis,
  maxCardsInSession,
}: {
  promptStates: ReadonlyMap<PromptTaskID, PromptState>;
  thresholdTimestampMillis: number;
  maxCardsInSession?: number;
}): PromptTaskID[] {
  const duePromptTaskIDs = [...promptStates.keys()].filter(
    (promptTask) =>
      promptStates.get(promptTask)!.dueTimestampMillis <=
      thresholdTimestampMillis,
  );

  const cardsRemaining = maxCardsInSession ?? getReviewSessionCardLimit();

  return (
    duePromptTaskIDs
      // Prefer lower-level cards when choosing the subset of questions to review.
      .sort((a, b) => {
        const promptStateA = promptStates.get(a)!;
        const promptStateB = promptStates.get(b)!;

        // TODO: consistent shuffle by task ID
        return (
          promptStateA.dueTimestampMillis - promptStateB.dueTimestampMillis
        );
      })
      // Apply our review cap.
      .slice(0, cardsRemaining)
  );
}
