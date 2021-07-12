import { AttachmentMimeType } from "@withorbit/core";
import { AttachmentReference } from "./entities/attachmentReference";
import { Task, TaskProvenance, TaskSpec } from "./entities/task";
import { Entity, IDOfEntity } from "./entity";

// Events are the central data type in our system. Entities are created and updated over time through a series of events.
export type Event =
  | TaskIngestEvent
  | TaskRepetitionEvent
  | AttachmentIngestEvent;

export enum EventType {
  TaskIngest = "taskIngest",
  TaskRepetition = "taskRepetition",

  AttachmentIngest = "attachmentIngest",
}

// ===

interface EventBase<T extends EventType, E extends Entity> {
  id: EventID;
  entityID: IDOfEntity<E>;
  type: T;
  timestampMillis: number; // Client-local time when event was created; used to compute relative times when generating entity snapshots, but not trusted for distributed syncing.

  /**
   * @ignore
   */
  __unusedEntityValue?: E; // This field shouldn't ever be used at runtime; it's just here because if the generic argument isn't actually used in the body, TS can't perform inference with it. Using it in entityID via IDOfEntity<E> isn't good enough.
}

export type TypeOfEvent<E extends EventBase<EventType, Entity>> =
  E extends EventBase<infer T, any> ? T : never;
export type EntityOfEvent<E extends Event> = E extends EventBase<any, infer EN>
  ? EN
  : never;

/**
 * @TJS-type string
 */
export type EventID = string & { __eventIDOpaqueType: never };

// Task events
// ===========

export interface TaskIngestEvent extends EventBase<EventType.TaskIngest, Task> {
  spec: TaskSpec;
  provenance: TaskProvenance | null;
  metadata?: { [key: string]: string };
}

export interface TaskRepetitionEvent
  extends EventBase<EventType.TaskRepetition, Task> {
  componentID: string;
  reviewSessionID: string; // a unique identifier shared by repetitions in the same logical review session
  outcome: TaskRepetitionOutcome;
}

export enum TaskRepetitionOutcome {
  Remembered = "remembered",
  Forgotten = "forgotten",
}

// TODO: reschedule, update metadata, update isDeleted

// Attachment events
// =================

export interface AttachmentIngestEvent
  extends EventBase<EventType.AttachmentIngest, AttachmentReference> {
  mimeType: AttachmentMimeType;
}
