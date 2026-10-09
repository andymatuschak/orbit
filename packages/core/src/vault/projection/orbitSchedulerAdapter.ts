import type { TaskComponentState } from "../../entities/task.js";
import { createSpacedRepetitionScheduler } from "../../schedulers/spacedRepetitionScheduler.js";
import type { OrbitSchedulerPolicy } from "../schema.js";
import type { RescheduleObservation, ReviewObservation } from "../schema.js";

export function createOrbitSchedulerAdapter(policy: OrbitSchedulerPolicy) {
  if (policy.kind !== "orbit-sm2-like" || policy.version !== 1)
    throw new Error("Unsupported scheduler policy");
  const scheduler = createSpacedRepetitionScheduler({
    intervalGrowthFactor: policy.intervalGrowthFactor,
    initialReviewInterval: policy.initialReviewIntervalMillis,
  });
  return {
    initialize(createdAtTimestampMillis: number): TaskComponentState {
      return {
        createdAtTimestampMillis,
        lastRepetitionTimestampMillis: null,
        intervalMillis: 0,
        dueTimestampMillis: createdAtTimestampMillis,
      };
    },
    applyReview(
      state: TaskComponentState,
      observation: ReviewObservation,
    ): TaskComponentState {
      return {
        createdAtTimestampMillis: state.createdAtTimestampMillis,
        lastRepetitionTimestampMillis: observation.occurredAtTimestampMillis,
        ...scheduler.computeNextDueIntervalMillisForRepetition(
          state,
          observation.occurredAtTimestampMillis,
          observation.outcome,
        ),
      };
    },
    applyReschedule(
      state: TaskComponentState,
      observation: RescheduleObservation,
    ): TaskComponentState {
      return {
        ...state,
        dueTimestampMillis: observation.newDueTimestampMillis,
      };
    },
  };
}
