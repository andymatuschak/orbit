import { Task, TaskProvenance, TaskSpec } from "./entities/task";
import { Entity, IDOfEntity } from "./entity";

// Events are the central data type in our system. Entities are created and updated over time through a series of events.
interface EventBase<
  T extends EventType = EventType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  E extends Entity = Entity,
> {
  id: EventID;
  entityID: IDOfEntity<Entity>;
  type: T;
  timestampMillis: number; // Client-local time when event was created; used to compute relative times when generating entity snapshots, but not trusted for distributed syncing.
}

export type Event = IngestEvent | RepetitionEvent;
export type TypeOfEvent<E extends Event> = E extends EventBase<infer T>
  ? T
  : never;
export type EntityOfEvent<E extends Event> = E extends EventBase<any, infer EN>
  ? EN
  : never;

/**
 * @TJS-type string
 */
export type EventID = string & { __eventIDOpaqueType: never };

export enum EventType {
  Ingest = "ingest",
  Repetition = "repetition",
}

// ---

export interface IngestEvent extends EventBase<EventType.Ingest, Task> {
  spec: TaskSpec;
  provenance: TaskProvenance | null;
  metadata?: { [key: string]: string };
}

export interface RepetitionEvent extends EventBase<EventType.Repetition, Task> {
  type: EventType.Repetition;

  componentID: string;
  reviewSessionID: string; // a unique identifier shared by repetitions in the same logical review session
  outcome: RepetitionOutcomeType;
}

export enum RepetitionOutcomeType {
  Remembered = "remembered",
  Forgotten = "forgotten",
}

// TODO: reschedule, update metadata, update isDeleted
