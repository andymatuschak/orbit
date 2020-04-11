import { PromptTaskParameters } from "../types/promptTaskParameters";
import {
  getIntervalSequenceForSchedule,
  getLevelForInterval,
  MetabookSpacedRepetitionSchedule,
  PromptRepetitionOutcome,
} from "./spacedRepetition";

export function getNextRepetitionInterval<P extends PromptTaskParameters>({
  schedule,
  reviewIntervalMillis,
  outcome,
  currentlyNeedsRetry,
  supportsRetry,
}: {
  reviewIntervalMillis: number;
  currentlyNeedsRetry: boolean;
  outcome: PromptRepetitionOutcome;
  schedule: MetabookSpacedRepetitionSchedule;
  supportsRetry: boolean;
}) {
  const intervalSequence = getIntervalSequenceForSchedule(schedule);
  const currentLevel = getLevelForInterval(reviewIntervalMillis, schedule);
  let newLevel: number;
  if (outcome === PromptRepetitionOutcome.Remembered) {
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
      // TODO: shouldn't extend further than your previous max level
      newLevel = currentLevel - 1;
    }
  }
  return intervalSequence[newLevel].interval;
}
