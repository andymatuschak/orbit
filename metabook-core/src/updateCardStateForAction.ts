import { CardState } from "./types/cardState";
import {
  getIntervalSequenceForSchedule,
  getLevelForInterval,
  MetabookActionOutcome,
  MetabookSpacedRepetitionSchedule,
} from "./spacedRepetition";
import { PromptType } from "./types/promptData";

export default function updateCardStateForAction({
  baseCardState,
  cardType,
  actionOutcome,
  schedule,
  reviewTimestampMillis,
  generatedOrderSeed,
}: {
  baseCardState: CardState | null;
  cardType: PromptType;
  actionOutcome: MetabookActionOutcome;
  schedule: MetabookSpacedRepetitionSchedule;
  reviewTimestampMillis: number;
  generatedOrderSeed: number;
}) {
  const supportsRetry = cardType !== "applicationPrompt";
  const currentReviewInterval = baseCardState ? baseCardState.interval : 0;
  const currentBestInterval = baseCardState ? baseCardState.bestInterval : null;
  const currentlyNeedsRetry =
    (baseCardState && baseCardState.needsRetry) || false;

  const intervalSequence = getIntervalSequenceForSchedule(schedule);

  const currentLevel = getLevelForInterval(currentReviewInterval, schedule);
  let newLevel: number;
  if (actionOutcome === "remembered") {
    if (currentlyNeedsRetry && currentLevel > 0) {
      // If the card needs to be retried, and the user remembers, then we just remove the retry indication. Unless they're on the "in-text" level, in which case we still bump them up to 5 days.
      newLevel = currentLevel;
    } else {
      newLevel = Math.min(intervalSequence.length - 1, currentLevel + 1);
    }
  } else {
    if (currentLevel <= 1) {
      newLevel = supportsRetry ? currentLevel : 1;
    } else {
      newLevel = currentLevel - 1;
    }
  }

  const newInterval = intervalSequence[newLevel].interval;

  let newDueTimestampMillis: number;
  let newOrderSeed: number;
  if (supportsRetry && actionOutcome === "forgotten") {
    newDueTimestampMillis = reviewTimestampMillis;
    newOrderSeed =
      baseCardState && baseCardState.needsRetry
        ? (baseCardState.orderSeed || generatedOrderSeed) + 1
        : generatedOrderSeed;
  } else {
    newDueTimestampMillis = reviewTimestampMillis + newInterval;
    newOrderSeed = generatedOrderSeed;
  }

  let bestInterval: number | null;
  if (actionOutcome === "remembered") {
    if (
      currentlyNeedsRetry &&
      getLevelForInterval(currentReviewInterval, schedule) > 0
    ) {
      bestInterval = currentBestInterval;
    } else {
      bestInterval = Math.max(currentBestInterval || 0, currentReviewInterval);
    }
  } else {
    bestInterval = currentBestInterval;
  }

  const newCardState: CardState = {
    dueTimestampMillis: newDueTimestampMillis,
    bestInterval,
    interval: newInterval,
    needsRetry: supportsRetry && actionOutcome === "forgotten",
    orderSeed: newOrderSeed,
  };
  return newCardState;
}
