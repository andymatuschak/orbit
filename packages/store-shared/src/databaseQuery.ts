import {
  Entity,
  EventID,
  IDOfEntity,
  Task,
  TypeOfEntity,
} from "@withorbit/core";

export interface DatabaseEventQuery extends DatabaseQueryOptions<EventID> {
  predicate?: DatabaseQueryPredicate<"entityID", "=", string>;
}

export type DatabaseEntityQuery<E extends Entity> = DatabaseQueryOptions<
  IDOfEntity<E>
> & {
  entityType: TypeOfEntity<E>;
  predicate?: E extends Task ? DatabaseTaskQueryPredicate : never;
};
// When dueTimestampMillis is used as a predicate, only non-deleted tasks will be returned.
export type DatabaseTaskQueryPredicate = DatabaseQueryPredicate<
  "dueTimestampMillis",
  "<=",
  number
>;

export type DatabaseQueryPredicate<
  Key extends string = string,
  Relation extends DatabaseQueryPredicateRelation = DatabaseQueryPredicateRelation,
  Value = string | number,
> = readonly [key: Key, relation: Relation, value: Value];

export type DatabaseQueryPredicateRelation = "=" | "<" | "<=" | ">" | ">=";

export type DatabaseQueryOptions<ID extends string> = {
  afterID?: ID;
  limit?: number;
};
