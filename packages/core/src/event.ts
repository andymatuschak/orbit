import {
  AttachmentMIMEType,
  AttachmentReference,
} from "./entities/attachmentReference.js";
import { Task, TaskProvenance, TaskSpec } from "./entities/task.js";
import { Entity, IDOfEntity } from "./entity.js";

// Events are the central data type in our system. Entities are created and updated over time through a series of events.
export type Event =
  | TaskIngestEvent
  | TaskRepetitionEvent
  | TaskRescheduleEvent
  | TaskUpdateDeletedEvent
  | TaskUpdateSpecEvent
  | TaskUpdateProvenanceEvent
  | TaskUpdateMetadataEvent
  | AttachmentIngestEvent;

export enum EventType {
  TaskIngest = "taskIngest",
  TaskRepetition = "taskRepetition",
  TaskReschedule = "taskReschedule",
  TaskUpdateDeleted = "taskUpdatedDeleted",
  TaskUpdateSpecEvent = "taskUpdateSpec",
  TaskUpdateProvenanceEvent = "taskUpdateProvenanceEvent",
  TaskUpdateMetadataEvent = "taskUpdateMetadata",

  AttachmentIngest = "attachmentIngest",
}

export type EventForEntity<E extends Entity> = Event & EventBase<EventType, E>;

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
 * @TJS-pattern ^[0-9a-zA-Z_\-]{22}$
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

export interface TaskRescheduleEvent
  extends EventBase<EventType.TaskReschedule, Task> {
  componentID: string;
  newDueTimestampMillis: number;
}

export interface TaskUpdateDeletedEvent
  extends EventBase<EventType.TaskUpdateDeleted, Task> {
  isDeleted: boolean;
}

export interface TaskUpdateProvenanceEvent
  extends EventBase<EventType.TaskUpdateProvenanceEvent, Task> {
  provenance: TaskProvenance | null;
}

export interface TaskUpdateMetadataEvent
  extends EventBase<EventType.TaskUpdateMetadataEvent, Task> {
  metadata: { [key: string]: string }; // is merged with existing metadata
}

export interface TaskUpdateSpecEvent
  extends EventBase<EventType.TaskUpdateSpecEvent, Task> {
  spec: TaskSpec;
}

export enum TaskRepetitionOutcome {
  Remembered = "remembered",
  Forgotten = "forgotten",
  Skipped = "skipped",
}

// TODO: update metadata

// Attachment events
// =================

export interface AttachmentIngestEvent
  extends EventBase<EventType.AttachmentIngest, AttachmentReference> {
  mimeType: AttachmentMIMEType;
}
