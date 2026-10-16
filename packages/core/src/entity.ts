import { AttachmentReference } from "./entities/attachmentReference.js";
import { Task } from "./entities/task.js";

// Entities are application-facing records with stable identities. Task state is
// projected from vault task definitions and scheduling observations.
export type Entity = Task | AttachmentReference;

export enum EntityType {
  Task = "task",
  AttachmentReference = "attachmentReference",
}

// ===

export interface EntityBase<ET extends EntityType, ID extends string> {
  id: ID;
  type: ET;
  createdAtTimestampMillis: number;
}

/**
 * @TJS-type string
 */
export type EntityID = IDOfEntity<Entity>;

export type TypeOfEntity<E extends EntityBase<EntityType, EntityID>> =
  E extends EntityBase<infer Type, any> ? Type : never;

export type IDOfEntity<E extends EntityBase<EntityType, EntityID>> =
  E extends EntityBase<any, infer ID> ? ID : never;
