import { TaskComponentState } from "../entities/task.js";
import { TaskRepetitionOutcome } from "../event.js";
import { Scheduler, SchedulerOutput } from "../scheduler.js";

export const defaultSpacedRepetitionSchedulerConfiguration = {
  intervalGrowthFactor: 2.3,
  initialReviewInterval: 1000 * 60 * 60 * 24 * 5, // five days
};

export interface SpacedRepetitionSchedulerConfiguration {
  intervalGrowthFactor: number;
  initialReviewInterval: number;
}

export function createSpacedRepetitionScheduler(
  schedulerConfiguration: SpacedRepetitionSchedulerConfiguration = defaultSpacedRepetitionSchedulerConfiguration,
): Scheduler {
  return {
    computeNextDueIntervalMillisForRepetition(
      componentState: TaskComponentState,
      timestampMillis: number,
      outcome: TaskRepetitionOutcome,
    ): SchedulerOutput {
      const currentReviewIntervalMillis = Math.max(
        0,
        timestampMillis -
          (componentState.lastRepetitionTimestampMillis ??
            componentState.createdAtTimestampMillis),
      );

      let newIntervalMillis: number;
      if (
        outcome === TaskRepetitionOutcome.Remembered ||
        outcome === TaskRepetitionOutcome.Skipped
      ) {
        if (currentReviewIntervalMillis < componentState.intervalMillis) {
          // We'll be in this case if the user is retrying or if they practiced again too early.
          // In this case, the next interval will be unchanged, unless they waited long enough that the current review interval would naturally grow larger than that.
          newIntervalMillis = Math.max(
            componentState.intervalMillis,
            schedulerConfiguration.initialReviewInterval,
            Math.floor(
              currentReviewIntervalMillis *
                schedulerConfiguration.intervalGrowthFactor,
            ),
          );
        } else {
          newIntervalMillis = Math.max(
            schedulerConfiguration.initialReviewInterval,
            Math.floor(
              currentReviewIntervalMillis *
                schedulerConfiguration.intervalGrowthFactor,
            ),
          );
        }
      } else {
        if (
          componentState.intervalMillis <
          schedulerConfiguration.initialReviewInterval
        ) {
          // They haven't managed to hit the minimum review interval yet, so we stay at the same interval.
          newIntervalMillis = componentState.intervalMillis;
        } else {
          // Something to consider here... if they do an early review, and forget, should we "penalize" them? In principle, they've demonstrated that they aren't able to retain the detail across that span. So it seems like it'd be best to use their actual demonstrated interval as the basis, rather than the scheduled interval. But in practice, I suspect this would mostly be annoying, and that it's better to limit how much is "at stake" at a given time.
          newIntervalMillis = Math.max(
            schedulerConfiguration.initialReviewInterval,
            Math.floor(
              componentState.intervalMillis /
                schedulerConfiguration.intervalGrowthFactor,
            ),
          );
        }
      }

      // We'll generate a small offset, so prompts don't always end up in the same order. Here the maximum jitter is 10 minutes.
      const jitter = (timestampMillis % 1000) * (60 * 10);
      const newDueTimestampMillis =
        timestampMillis +
        jitter +
        (outcome === TaskRepetitionOutcome.Forgotten
          ? 1000 * 60 * 10 // When forgotten, assign it to be due in 10 minutes or so.
          : newIntervalMillis);

      return {
        dueTimestampMillis: newDueTimestampMillis,
        intervalMillis: newIntervalMillis,
      };
    },
  };
}
