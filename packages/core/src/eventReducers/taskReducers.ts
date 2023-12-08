import {
  mainTaskComponentID,
  Task,
  TaskComponentState,
} from "../entities/task.js";
import { EntityType } from "../entity.js";
import {
  EventID,
  EventType,
  TaskIngestEvent,
  TaskRepetitionEvent,
  TaskRescheduleEvent,
  TaskUpdateDeletedEvent,
  TaskUpdateMetadataEvent,
  TaskUpdateProvenanceEvent,
  TaskUpdateSpecEvent,
} from "../event.js";
import { createSpacedRepetitionScheduler } from "../schedulers/spacedRepetitionScheduler.js";

export function taskIngestEventReducer(
  oldSnapshot: Task | null,
  event: TaskIngestEvent,
): Task {
  if (oldSnapshot) {
    return {
      ...oldSnapshot,
      provenance: event.provenance ?? oldSnapshot.provenance,
      spec: oldSnapshot.spec,
      isDeleted: false,
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

  return modifyTaskComponent(
    oldSnapshot,
    event.componentID,
    event.id,
    (oldState) => ({
      createdAtTimestampMillis: oldState.createdAtTimestampMillis,
      lastRepetitionTimestampMillis: event.timestampMillis,
      ...scheduler.computeNextDueIntervalMillisForRepetition(
        oldState,
        event.timestampMillis,
        event.outcome,
      ),
    }),
  );
}

export function taskRescheduleEventReducer(
  oldSnapshot: Task | null,
  event: TaskRescheduleEvent,
): Task {
  assertTaskExists(oldSnapshot, event.type);
  return modifyTaskComponent(
    oldSnapshot,
    event.componentID,
    event.id,
    (oldState) => ({
      ...oldState,
      dueTimestampMillis: event.newDueTimestampMillis,
    }),
  );
}

export function taskUpdateDeletedEventReducer(
  oldSnapshot: Task | null,
  event: TaskUpdateDeletedEvent,
): Task {
  assertTaskExists(oldSnapshot, event.type);
  return { ...oldSnapshot, isDeleted: event.isDeleted };
}

export function taskUpdateSpecEventReducer(
  oldSnapshot: Task | null,
  event: TaskUpdateSpecEvent,
): Task {
  assertTaskExists(oldSnapshot, event.type);
  return { ...oldSnapshot, spec: event.spec };
}

export function taskUpdateProvenanceEventReducer(
  oldSnapshot: Task | null,
  event: TaskUpdateProvenanceEvent,
): Task {
  assertTaskExists(oldSnapshot, event.type);
  return { ...oldSnapshot, provenance: event.provenance };
}

export function taskUpdateMetadataEventReducer(
  oldSnapshot: Task | null,
  event: TaskUpdateMetadataEvent,
): Task {
  assertTaskExists(oldSnapshot, event.type);
  return {
    ...oldSnapshot,
    metadata: { ...oldSnapshot.metadata, ...event.metadata },
  };
}

function modifyTaskComponent(
  oldSnapshot: Task,
  componentID: string,
  eventID: EventID,
  transformer: (oldState: TaskComponentState) => TaskComponentState,
): Task {
  const componentState = oldSnapshot.componentStates[componentID];
  if (!componentState) {
    // TODO: Consider making this a hard failure. I'm leaving it as a soft failure for now because it sometimes occurs during migrations from Anki, in which cloze content can change over time and "leave behind" some components.
    console.error(
      `Repetition on unknown component ${componentID} in event ${eventID} on ${oldSnapshot.id}`,
    );
    return oldSnapshot;
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
