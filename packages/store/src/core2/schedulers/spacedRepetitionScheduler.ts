import {
  getIntervalSequenceForSchedule,
  getNextRepetitionInterval,
  MetabookSpacedRepetitionSchedule,
  PromptRepetitionOutcome,
} from "@withorbit/core";
import { getLevelForInterval } from "@withorbit/core/dist/spacedRepetition";
import { TaskComponentState } from "../entities/task";
import { RepetitionOutcomeType } from "../event";
import { Scheduler } from "../scheduler";

export const defaultSpacedRepetitionScheduler = createSpacedRepetitionScheduler(
  {
    intervalGrowthFactor: 2.3,
    minimumReviewInterval: 1000 * 60 * 60 * 24 * 5,
  },
);

export interface SpacedRepetitionSchedulerConfiguration {
  intervalGrowthFactor: number;
  minimumReviewInterval: number;
}

export function createSpacedRepetitionScheduler(
  schedulerConfiguration: SpacedRepetitionSchedulerConfiguration,
): Scheduler {
  return {
    applyRepetitionToComponentState(
      componentState: TaskComponentState,
      timestampMillis: number,
      outcome: RepetitionOutcomeType,
    ): TaskComponentState {
      const currentReviewInterval = Math.max(
        0,
        timestampMillis -
          (componentState.lastRepetitionTimestampMillis ??
            componentState.dueTimestampMillis),
      );

      const newIntervalMillis = getNextRepetitionInterval({
        reviewIntervalMillis: currentReviewInterval,
        scheduledIntervalMillis: componentState.intervalMillis,
        outcome: outcome as unknown as PromptRepetitionOutcome, // TODO: remove this hacky cast when rebasing underlying function to core2,
        schedulerConfiguration,
      });

      // We'll generate a small offset, so prompts don't always end up in the same order. Here the maximum jitter is 10 minutes.
      const jitter = (timestampMillis % 1000) * (60 * 10);
      const newDueTimestampMillis =
        timestampMillis +
        jitter +
        (outcome === RepetitionOutcomeType.Remembered
          ? newIntervalMillis
          : 1000 * 60 * 10); // When forgotten, assign it to be due in 10 minutes or so.

      return {
        intervalMillis: newIntervalMillis,
        lastRepetitionTimestampMillis: timestampMillis,
        dueTimestampMillis: newDueTimestampMillis,
      };
    },
  };
}

export function getNextRepetitionInterval({
  reviewIntervalMillis,
  scheduledIntervalMillis,
  outcome,
  schedulerConfiguration,
}: {
  reviewIntervalMillis: number;
  scheduledIntervalMillis: number;
  outcome: PromptRepetitionOutcome;
  schedulerConfiguration: SpacedRepetitionSchedulerConfiguration;
}): number {
  if (outcome === PromptRepetitionOutcome.Remembered) {
    // TODO: OK, so the thing that makes me still need key (or some way to compute it) is that when the scheduled interval is 0, I can't disambiguate whether the previous attempt was a failure.
    if (currentlyNeedsRetry) {
      // If the card needs to be retried, and the user remembers, then we just remove the retry indication.
      // If it happens that they waited a long time before attempting a retry, and that time is longer than their scheduled interval, we'll give them credit for that.
      // Unless they're below the first level, in which case we still bump them up to 5 days.
      return Math.max(
        scheduledIntervalMillis,
        reviewIntervalMillis / schedulerConfiguration.intervalGrowthFactor,
        schedulerConfiguration.minimumReviewInterval,
      );
    } else {
      return Math.max(
        schedulerConfiguration.minimumReviewInterval,
        Math.floor(
          reviewIntervalMillis * schedulerConfiguration.intervalGrowthFactor,
        ),
      );
    }
  } else {
    if (
      scheduledIntervalMillis < schedulerConfiguration.minimumReviewInterval
    ) {
      // They haven't managed to hit the minimum review interval yet, so we stay at the same interval.
      return scheduledIntervalMillis;
    } else {
      return Math.max(
        schedulerConfiguration.minimumReviewInterval,
        Math.floor(
          scheduledIntervalMillis / schedulerConfiguration.intervalGrowthFactor,
        ),
      );
    }
  }
}
