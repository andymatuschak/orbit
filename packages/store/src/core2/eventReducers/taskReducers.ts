import { mainTaskComponentID, Task } from "../entities/task";
import { EntityType } from "../entity";
import { TaskIngestEvent, TaskRepetitionEvent } from "../event";
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
    const specComponents = event.spec.content.components;
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
  if (!oldSnapshot) {
    throw new Error(`Can't apply repetition event to a non-existent task`);
  }

  const componentState = oldSnapshot.componentStates[event.componentID];
  if (!componentState) {
    throw new Error(`Repetition on unknown component ${event.componentID}`);
  }

  return {
    ...oldSnapshot,
    componentStates: {
      ...oldSnapshot.componentStates,
      [event.componentID]: {
        ...oldSnapshot.componentStates[event.componentID],
        ...scheduler.computeNextDueIntervalMillisForRepetition(
          componentState,
          event.timestampMillis,
          event.outcome,
        ),
      },
    },
  };
}
