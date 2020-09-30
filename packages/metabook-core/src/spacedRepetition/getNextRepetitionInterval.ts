import {
  getIntervalSequenceForSchedule,
  getLevelForInterval,
  MetabookSpacedRepetitionSchedule,
  PromptRepetitionOutcome,
} from "./spacedRepetition";

const growthFactor = 2.3;

export function getNextRepetitionInterval({
  schedule,
  reviewIntervalMillis,
  scheduledIntervalMillis,
  outcome,
  currentlyNeedsRetry,
  supportsRetry,
}: {
  reviewIntervalMillis: number;
  scheduledIntervalMillis: number | null;
  currentlyNeedsRetry: boolean;
  outcome: PromptRepetitionOutcome;
  schedule: MetabookSpacedRepetitionSchedule;
  supportsRetry: boolean;
}): number {
  const intervalSequence = getIntervalSequenceForSchedule(schedule);
  if (outcome === PromptRepetitionOutcome.Remembered) {
    if (currentlyNeedsRetry) {
      // If the card needs to be retried, and the user remembers, then we just remove the retry indication.
      // If it happens that they waited a long time before attempting a retry, and that time is longer than their scheduled interval, we'll give them credit for that.
      // Unless they're on the "in-text" level, in which case we still bump them up to 5 days.
      return Math.max(
        scheduledIntervalMillis!,
        reviewIntervalMillis / growthFactor,
        intervalSequence[1].interval,
      );
    } else {
      return Math.max(
        intervalSequence[1].interval,
        Math.floor(reviewIntervalMillis * growthFactor),
      );
    }
  } else {
    const scheduledLevel =
      scheduledIntervalMillis === null
        ? 0
        : getLevelForInterval(scheduledIntervalMillis, schedule);
    if (scheduledLevel <= 1) {
      return intervalSequence[supportsRetry ? scheduledLevel : 1].interval;
    } else {
      return Math.max(
        intervalSequence[1].interval,
        Math.floor(scheduledIntervalMillis! / growthFactor),
      );
    }
  }
}
