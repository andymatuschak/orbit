import {
  checkParameters,
  clipParameters,
  dateDiffInDays,
  fsrs,
  Rating,
} from "ts-fsrs";
import {
  TaskRepetitionOutcome,
  type TaskComponentState,
} from "../../entities/task.js";
import type { ObservationID } from "../ids.js";
import type {
  FSRSSchedulerPolicy,
  RescheduleObservation,
  ReviewObservation,
  SchedulerPolicy,
} from "../schema.js";
import { createOrbitSchedulerAdapter } from "./orbitSchedulerAdapter.js";

const dayMillis = 24 * 60 * 60 * 1_000;

export function validateFSRSSchedulerPolicy(policy: FSRSSchedulerPolicy): void {
  if (
    policy.kind !== "fsrs" ||
    policy.version !== 1 ||
    policy.modelVersion !== 6 ||
    !Array.isArray(policy.weights) ||
    policy.weights.length !== 21 ||
    !Array.from(policy.weights).every((weight) => Number.isFinite(weight)) ||
    !Number.isFinite(policy.requestedRetention) ||
    policy.requestedRetention <= 0 ||
    policy.requestedRetention > 1 ||
    !Number.isSafeInteger(policy.cutoverTimestampMillis) ||
    policy.cutoverTimestampMillis < 0 ||
    policy.previousPolicy?.kind !== "orbit-sm2-like" ||
    policy.previousPolicy.version !== 1 ||
    !Number.isFinite(policy.previousPolicy.intervalGrowthFactor) ||
    policy.previousPolicy.intervalGrowthFactor <= 0 ||
    !Number.isSafeInteger(policy.previousPolicy.initialReviewIntervalMillis) ||
    policy.previousPolicy.initialReviewIntervalMillis < 0
  ) {
    throw new Error(
      "Unsupported scheduler policy: expected FSRS-6 cutover policy",
    );
  }
  checkParameters(policy.weights);
  const clipped = clipParameters(policy.weights, 0, true);
  if (policy.weights.some((weight, index) => weight !== clipped[index])) {
    throw new Error(
      "Unsupported scheduler policy: FSRS-6 weights out of bounds",
    );
  }
}

/**
 * An earlier importer duplicated some observations as legacy/<ordinal>/<id>.
 * Only those matching original IDs AND complete payloads count as one recall.
 * Equal timestamps alone are not evidence of duplication.
 */
export function reviewHistoryIdentity(
  id: ObservationID,
  observation: ReviewObservation,
): string {
  const originalID = id.replace(/^legacy\/(?:\d+\/)?/, "legacy/");
  return JSON.stringify([
    originalID,
    observation.taskID,
    observation.componentID,
    observation.occurredAtTimestampMillis,
    observation.reviewSessionID,
    observation.outcome,
  ]);
}

interface VaultSchedulerAdapter {
  initialize(createdAtTimestampMillis: number): TaskComponentState;
  applyReview(
    state: TaskComponentState,
    observation: ReviewObservation,
    includeMemory?: boolean,
  ): TaskComponentState;
  applyReschedule(
    state: TaskComponentState,
    observation: RescheduleObservation,
  ): TaskComponentState;
}

export function createVaultSchedulerAdapter(
  policy: SchedulerPolicy,
): VaultSchedulerAdapter {
  if (policy.kind === "orbit-sm2-like") {
    return createOrbitSchedulerAdapter(policy);
  }
  if (policy.kind !== "fsrs") throw new Error("Unsupported scheduler policy");
  validateFSRSSchedulerPolicy(policy);
  const previous = createOrbitSchedulerAdapter(policy.previousPolicy);
  const algorithm = fsrs({
    w: policy.weights,
    request_retention: policy.requestedRetention,
    enable_fuzz: false,
    enable_short_term: true,
    // We use FSRS's memory model, not its Card learning-step state machine.
    // Match the optimizer's num_relearning_steps=0 without implicit defaults.
    learning_steps: [],
    relearning_steps: [],
  });

  return {
    initialize: previous.initialize,
    applyReschedule: previous.applyReschedule,
    applyReview(
      state: TaskComponentState,
      observation: ReviewObservation,
      includeMemory = true,
    ): TaskComponentState {
      const timestamp = observation.occurredAtTimestampMillis;
      const skipped = observation.outcome === TaskRepetitionOutcome.Skipped;
      let memory = state.fsrs;
      if (!skipped && includeMemory) {
        const elapsedDays = memory
          ? dateDiffInDays(
              new Date(memory.lastReviewTimestampMillis),
              new Date(timestamp),
            )
          : 0;
        memory = {
          ...algorithm.next_state(
            memory ?? null,
            elapsedDays,
            observation.outcome === TaskRepetitionOutcome.Remembered
              ? Rating.Good
              : Rating.Again,
          ),
          lastReviewTimestampMillis: timestamp,
          ...(observation.outcome === TaskRepetitionOutcome.Forgotten &&
          timestamp >= policy.cutoverTimestampMillis
            ? { isRetry: true as const }
            : {}),
        };
      }

      // Warm up the FSRS memory with history while preserving every existing
      // Orbit due/interval exactly, including duplicated legacy observations.
      if (timestamp < policy.cutoverTimestampMillis) {
        const scheduled = previous.applyReview(state, observation);
        return memory ? { ...scheduled, fsrs: memory } : scheduled;
      }
      if (skipped) {
        return { ...state, dueTimestampMillis: timestamp + dayMillis };
      }
      if (!includeMemory) return state;
      const intervalMillis =
        algorithm.next_interval(memory!.stability, 0) * dayMillis;
      return {
        ...state,
        fsrs: memory,
        lastRepetitionTimestampMillis: timestamp,
        intervalMillis,
        dueTimestampMillis:
          timestamp +
          (observation.outcome === TaskRepetitionOutcome.Forgotten
            ? 10 * 60 * 1_000
            : intervalMillis),
      };
    },
  };
}
