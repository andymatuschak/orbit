import {
  getNextRepetitionInterval,
  PromptRepetitionOutcome,
} from "@withorbit/core";
import { EntityType } from "../entities/entityBase";
import { mainTaskComponentID, Task } from "../entities/task";
import {
  RepetitionOutcomeType,
  TaskIngestEvent,
  TaskRepetitionEvent,
} from "../event";

export function taskIngestEventReducer(
  oldSnapshot: Task | null,
  event: TaskIngestEvent,
): Task {
  if (oldSnapshot) {
    return {
      ...oldSnapshot,
      provenance: event.provenance ?? oldSnapshot.provenance,
      spec: oldSnapshot.spec,
      metadata: { ...oldSnapshot.metadata, ...event.metadata },
    };
  } else {
    const specComponents = event.spec.content.components;
    const componentIDs = specComponents
      ? Object.keys(specComponents)
      : [mainTaskComponentID];
    return {
      id: event.entityID,
      type: EntityType.Task,
      spec: event.spec,
      provenance: event.provenance,
      metadata: event.metadata ?? {},
      isDeleted: false,
      componentStates: Object.fromEntries(
        componentIDs.map((id) => [
          id,
          {
            lastRepetitionTimestampMillis: null,
            dueTimestampMillis: event.timestampMillis,
            intervalMillis: 0,
          },
        ]),
      ),
    };
  }
}

export function taskRepetitionEventReducer(
  oldSnapshot: Task | null,
  event: TaskRepetitionEvent,
): Task {
  if (!oldSnapshot) {
    throw new Error(`Can't apply repetition event to a non-existent task`);
  }

  const componentState = oldSnapshot.componentStates[event.componentID];
  if (!componentState) {
    throw new Error(`Repetition on unknown component ${event.componentID}`);
  }

  const currentReviewInterval = Math.max(
    0,
    event.timestampMillis -
      (componentState.lastRepetitionTimestampMillis ??
        componentState.dueTimestampMillis),
  );

  const newIntervalMillis = getNextRepetitionInterval({
    schedule: "default",
    reviewIntervalMillis: currentReviewInterval,
    scheduledIntervalMillis: componentState.intervalMillis,
    outcome: event.outcome as unknown as PromptRepetitionOutcome, // TODO: remove this hacky cast when rebasing underlying function to core2
    supportsRetry: true,
    currentlyNeedsRetry: false, // TODO: not tracking this state anymore; think we can get away without it. But I need to implement the retry special-case elsewhere...
  });

  // We'll generate a small offset, so that cards don't always end up in the same order. Here the maximum jitter is 10 minutes.
  const jitter = (event.timestampMillis % 1000) * (60 * 10);
  let newDueTimestampMillis: number;
  if (event.outcome === RepetitionOutcomeType.Forgotten) {
    // Assign it to be due in 10 minutes or so.
    newDueTimestampMillis = event.timestampMillis + 300 + jitter;
  } else {
    newDueTimestampMillis = event.timestampMillis + newIntervalMillis + jitter;
  }

  return {
    ...oldSnapshot,
    componentStates: {
      ...oldSnapshot.componentStates,
      [event.componentID]: {
        dueTimestampMillis: newDueTimestampMillis,
        lastRepetitionTimestampMillis: event.timestampMillis,
        intervalMillis: newIntervalMillis,
      },
    },
  };
}
