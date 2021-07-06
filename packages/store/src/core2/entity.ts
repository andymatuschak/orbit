import { AttachmentReference } from "./entities/attachmentReference";
import { EntityBase, EntityID, EntityType } from "./entities/entityBase";
import { Task } from "./entities/task";

// An Entity is an object with a stable identity. Entity records aren't created or manipulated directly; they're computed from a sequence of Events. An entity data structure represents a snapshot of that entity's state up to a particular event.
export type Entity = Task | AttachmentReference;

export type { EntityID } from "./entities/entityBase";

export type TypeOfEntity<E extends EntityBase<EntityType, EntityID>> =
  E extends EntityBase<infer Type, any> ? Type : never;

export type IDOfEntity<E extends EntityBase<EntityType, EntityID>> =
  E extends EntityBase<any, infer ID> ? ID : never;
