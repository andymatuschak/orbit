import getNextTaskParameters from "./getNextTaskParameters";
import {
  getIntervalSequenceForSchedule,
  getLevelForInterval,
  MetabookActionOutcome,
  MetabookSpacedRepetitionSchedule,
} from "./spacedRepetition";
import { Prompt } from "./types/prompt";
import { PromptState } from "./types/promptState";

export default function updatePromptStateForAction({
  basePromptState,
  prompt,
  actionOutcome,
  schedule,
  reviewTimestampMillis,
}: {
  basePromptState: PromptState | null;
  prompt: Prompt;
  actionOutcome: MetabookActionOutcome;
  schedule: MetabookSpacedRepetitionSchedule;
  reviewTimestampMillis: number;
}) {
  const supportsRetry = prompt.promptType !== "applicationPrompt";
  const currentReviewInterval = basePromptState ? basePromptState.interval : 0;
  const currentBestInterval = basePromptState
    ? basePromptState.bestInterval
    : null;
  const currentlyNeedsRetry =
    (basePromptState && basePromptState.needsRetry) || false;

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
  if (supportsRetry && actionOutcome === "forgotten") {
    newDueTimestampMillis = reviewTimestampMillis;
  } else {
    newDueTimestampMillis = reviewTimestampMillis + newInterval;
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

  const newPromptState: PromptState = {
    dueTimestampMillis: newDueTimestampMillis,
    bestInterval,
    interval: newInterval,
    needsRetry: supportsRetry && actionOutcome === "forgotten",
    taskParameters: getNextTaskParameters(
      prompt,
      basePromptState?.taskParameters ?? null,
    ),
  };
  return newPromptState;
}
