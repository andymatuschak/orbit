// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface EntityBase<ET extends EntityType, ID extends EntityID> {
  id: ID;
}
/**
 * @TJS-type string
 */
export type EntityID = string & { __entityIDOpaqueType: never };

export enum EntityType {
  Task = "task",
}
