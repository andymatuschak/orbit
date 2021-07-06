import { EntityOfEvent, Event, EventType, TypeOfEvent } from "./event";
import { attachmentIngestEventReducer } from "./reducers/attachmentReducers";
import {
  taskIngestEventReducer,
  taskRepetitionEventReducer,
} from "./reducers/taskReducers";

const reducers: {
  [T in Event as TypeOfEvent<T>]: (
    oldSnapshot: EntityOfEvent<T> | null,
    event: T,
  ) => EntityOfEvent<T>;
} = {
  [EventType.TaskIngest]: taskIngestEventReducer,
  [EventType.TaskRepetition]: taskRepetitionEventReducer,

  [EventType.AttachmentIngest]: attachmentIngestEventReducer,
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
