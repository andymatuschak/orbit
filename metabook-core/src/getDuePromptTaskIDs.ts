import getCardLimitForReviewSession from "./getCardLimitForReviewSession";
import { PromptTaskID } from "./types/promptTask";
import { PromptState } from "./types/promptState";

// Given some time might be computing whether a user has a session due, we evaluate whether cards are due using a date slightly shifted into the future, to find the cards that'd be due on that conceptual day.
function getFuzzyDueTimeThreshold(nowMillis: number): number {
  return nowMillis + 1000 * 60 * 60 * 16; // 16 hour lookahead
}

export default function getDuePromptTaskIDs({
  promptStates,
  timestampMillis,
  reviewSessionIndex,
  cardsCompletedInCurrentSession,
}: {
  promptStates: ReadonlyMap<PromptTaskID, PromptState>;
  timestampMillis: number;
  reviewSessionIndex: number;
  cardsCompletedInCurrentSession: number;
}): PromptTaskID[] {
  const dueThresholdTimestamp = getFuzzyDueTimeThreshold(timestampMillis);
  const duePromptTaskIDs = [...promptStates.keys()].filter(
    (cardID) =>
      promptStates.get(cardID)!.dueTimestampMillis <= dueThresholdTimestamp,
  );

  const maxCardsInSession = getCardLimitForReviewSession(reviewSessionIndex);
  const cardsRemaining = Math.max(
    0,
    maxCardsInSession - cardsCompletedInCurrentSession,
  );

  return (
    duePromptTaskIDs
      // Prefer lower-level cards when choosing the subset of questions to review.
      .sort((a, b) => {
        const promptStateA = promptStates.get(a)!;
        const promptStateB = promptStates.get(b)!;

        if (promptStateA.interval === promptStateB.interval) {
          // TODO: Shuffle... maybe hash the due timestamp millis
          return (
            promptStateA.dueTimestampMillis - promptStateB.dueTimestampMillis
          );
        } else {
          return promptStateA.interval - promptStateB.interval;
        }
      })
      // Apply our review cap.
      .slice(0, cardsRemaining)
  );
}
