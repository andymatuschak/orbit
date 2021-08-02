import {
  mainTaskComponentID,
  Task,
  TaskComponentState,
} from "../entities/task";
import { EntityType } from "../entity";
import {
  EventType,
  TaskIngestEvent,
  TaskRepetitionEvent,
  TaskRescheduleEvent,
  TaskUpdateDeletedEvent,
} from "../event";
import { createSpacedRepetitionScheduler } from "../schedulers/spacedRepetitionScheduler";

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
    const specComponents =
      "components" in event.spec.content ? event.spec.content.components : null;
    const componentIDs = specComponents
      ? Object.keys(specComponents)
      : [mainTaskComponentID];
    return {
      id: event.entityID,
      type: EntityType.Task,
      createdAtTimestampMillis: event.timestampMillis,
      spec: event.spec,
      provenance: event.provenance,
      metadata: event.metadata ?? {},
      isDeleted: false,
      componentStates: Object.fromEntries(
        componentIDs.map((id) => [
          id,
          {
            createdAtTimestampMillis: event.timestampMillis,
            lastRepetitionTimestampMillis: null,
            dueTimestampMillis: event.timestampMillis,
            intervalMillis: 0,
          },
        ]),
      ),
    };
  }
}

const scheduler = createSpacedRepetitionScheduler();
export function taskRepetitionEventReducer(
  oldSnapshot: Task | null,
  event: TaskRepetitionEvent,
): Task {
  assertTaskExists(oldSnapshot, event.type);

  const componentState = oldSnapshot.componentStates[event.componentID];
  if (!componentState) {
    throw new Error(`Repetition on unknown component ${event.componentID}`);
  }

  return modifyTaskComponent(oldSnapshot, event.componentID, (oldState) => ({
    ...oldState,
    ...scheduler.computeNextDueIntervalMillisForRepetition(
      componentState,
      event.timestampMillis,
      event.outcome,
    ),
  }));
}

export function taskRescheduleEventReducer(
  oldSnapshot: Task | null,
  event: TaskRescheduleEvent,
): Task {
  assertTaskExists(oldSnapshot, event.type);
  return modifyTaskComponent(oldSnapshot, event.componentID, (oldState) => ({
    ...oldState,
    dueTimestampMillis: event.newDueTimestampMillis,
  }));
}

export function taskUpdateDeletedEventReducer(
  oldSnapshot: Task | null,
  event: TaskUpdateDeletedEvent,
): Task {
  assertTaskExists(oldSnapshot, event.type);
  return { ...oldSnapshot, isDeleted: event.isDeleted };
}

function modifyTaskComponent(
  oldSnapshot: Task,
  componentID: string,
  transformer: (oldState: TaskComponentState) => TaskComponentState,
): Task {
  const componentState = oldSnapshot.componentStates[componentID];
  if (!componentState) {
    throw new Error(`Repetition on unknown component ${componentID}`);
  }

  return {
    ...oldSnapshot,
    componentStates: {
      ...oldSnapshot.componentStates,
      [componentID]: transformer(oldSnapshot.componentStates[componentID]),
    },
  };
}

function assertTaskExists(
  snapshot: Task | null,
  eventType: EventType,
): asserts snapshot is Task {
  if (snapshot === null) {
    throw new Error(
      `Can't apply an event of type ${eventType} to a task without a prior snapshot`,
    );
  }
}
