import getCardLimitForReviewSession from "./getCardLimitForReviewSession";
import { decodePromptID, EncodedPromptID, PromptID } from "./promptID";
import { PromptState } from "./types/promptState";

// Given some time might be computing whether a user has a session due, we evaluate whether cards are due using a date slightly shifted into the future, to find the cards that'd be due on that conceptual day.
function getFuzzyDueTimeThreshold(nowMillis: number): number {
  return nowMillis + 1000 * 60 * 60 * 16; // 16 hour lookahead
}

export default function getDuePromptIDs({
  promptStates,
  timestampMillis,
  reviewSessionIndex,
  cardsCompletedInCurrentSession,
}: {
  promptStates: ReadonlyMap<EncodedPromptID, PromptState>;
  timestampMillis: number;
  reviewSessionIndex: number;
  cardsCompletedInCurrentSession: number;
}): PromptID[] {
  const dueThresholdTimestamp = getFuzzyDueTimeThreshold(timestampMillis);
  const dueCardIDs = [...promptStates.keys()].filter(
    (cardID) =>
      promptStates.get(cardID)!.dueTimestampMillis <= dueThresholdTimestamp,
  );

  const maxCardsInSession = getCardLimitForReviewSession(reviewSessionIndex);
  const cardsRemaining = Math.max(
    0,
    maxCardsInSession - cardsCompletedInCurrentSession,
  );

  const orderedDuePromptIDs = dueCardIDs
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
    .slice(0, cardsRemaining);

  return orderedDuePromptIDs
    .map(decodePromptID)
    .filter((p): p is PromptID => !!p);
}
