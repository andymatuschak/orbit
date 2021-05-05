import { TaskID, TaskIDPath } from "./taskCache";

export interface Task {}

export interface TaskCollection {}

export type TaskRecord<T extends Task, TC extends TaskCollection> =
  | {
      type: "task";
      value: T;
    }
  | TaskCollectionRecord<TC>;
export type TaskCollectionRecord<TC extends TaskCollection> = {
  type: "collection";
  value: TC;
  childIDs: Set<TaskID>;
};

export interface TaskSourceSession<T extends Task, TC extends TaskCollection> {
  getTaskNodes<Paths extends TaskIDPath[]>(
    paths: Paths,
  ): Promise<Map<Paths[number], TaskRecord<T, TC> | null>>;

  isCacheHit(
    cacheRecord: TaskRecord<T, TC>,
    testRecord: TaskRecord<T, TC>,
  ): boolean;
}

export interface TaskSource<T extends Task, TC extends TaskCollection> {
  performOperations(
    continuation: (session: TaskSourceSession<T, TC>) => Promise<unknown>,
  ): Promise<unknown>;
}
