import {
  getNextRepetitionInterval,
  PromptRepetitionOutcome,
} from "@withorbit/core";
import { mainTaskComponentID, Task } from "./entities/task";
import {
  EntityOfEvent,
  Event,
  EventType,
  IngestEvent,
  RepetitionEvent,
  RepetitionOutcomeType,
  TypeOfEvent,
} from "./event";

const reducers: {
  [T in Event as TypeOfEvent<T>]: (
    entitySnapshot: EntityOfEvent<T> | null,
    event: T,
  ) => EntityOfEvent<T>;
} = {
  [EventType.Ingest]: ingestEventReducer,
  [EventType.Repetition]: repetitionEventReducer,
};

export function eventReducer<E extends Event>(
  entitySnapshot: EntityOfEvent<E> | null,
  event: E,
): EntityOfEvent<E> {
  const reducer = reducers[event.type];
  if (reducer) {
    // Not sure why TS can't figure this one out...
    const typedReducer = reducer as unknown as (
      s: EntityOfEvent<E> | null,
      e: E,
    ) => EntityOfEvent<E>;
    return typedReducer(entitySnapshot, event);
  } else {
    throw new Error(`Unsupported event type ${event.type}`);
  }
}

function ingestEventReducer(
  entitySnapshot: Task | null,
  event: IngestEvent,
): Task {
  if (entitySnapshot) {
    return {
      ...entitySnapshot,
      provenance: event.provenance ?? entitySnapshot.provenance,
      spec: entitySnapshot.spec,
      metadata: { ...entitySnapshot.metadata, ...event.metadata },
    };
  } else {
    const specComponents = event.spec.content.components;
    const componentIDs = specComponents
      ? Object.keys(specComponents)
      : [mainTaskComponentID];
    return {
      id: event.entityID,
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

function repetitionEventReducer(
  entitySnapshot: Task | null,
  event: RepetitionEvent,
): Task {
  if (!entitySnapshot) {
    throw new Error(`Can't apply repetition event to a non-existent task`);
  }

  const componentState = entitySnapshot.componentStates[event.componentID];
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
    currentlyNeedsRetry: false, // TODO: not tracking this state anymore; think we can get away without it
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
    ...entitySnapshot,
    componentStates: {
      ...entitySnapshot.componentStates,
      [event.componentID]: {
        dueTimestampMillis: newDueTimestampMillis,
        lastRepetitionTimestampMillis: event.timestampMillis,
        intervalMillis: newIntervalMillis,
      },
    },
  };
}
