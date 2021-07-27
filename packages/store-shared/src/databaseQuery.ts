import {
  Entity,
  EventID,
  IDOfEntity,
  Task,
  TypeOfEntity,
} from "@withorbit/core2";

export interface DatabaseEventQuery extends DatabaseQueryOptions<EventID> {
  predicate?: DatabaseQueryPredicate<"entityID", "=", string>;
}

export type DatabaseEntityQuery<E extends Entity> = DatabaseQueryOptions<
  IDOfEntity<E>
> & {
  entityType: TypeOfEntity<E>;
  predicate?: E extends Task ? DatabaseTaskQueryPredicate : never;
};
export type DatabaseTaskQueryPredicate = DatabaseQueryPredicate<
  "dueTimestampMillis",
  "<=",
  number
>;

export type DatabaseQueryPredicate<
  Key extends string,
  Relation extends DatabaseQueryPredicateRelation,
  Value,
> = readonly [key: Key, relation: Relation, value: Value];

export type DatabaseQueryPredicateRelation = "=" | "<" | "<=" | ">" | ">=";

export type DatabaseQueryOptions<ID extends string> = {
  afterID?: ID;
  limit?: number;
};
