import { TaskCacheSession, TaskIDPath } from "../../taskCache/taskCache";
import {
  Task,
  TaskCollection,
  TaskRecord,
  TaskSourceSession,
} from "../../taskCache/taskSource";

export async function getItemAtPath<T extends Task, TC extends TaskCollection>(
  path: TaskIDPath,
  session: TaskCacheSession<T, TC> | TaskSourceSession<T, TC>
): Promise<TaskRecord<T, TC> | null> {
  const resultMap = await session.getTaskNodes([path]);
  return resultMap.get(path) || null;
}
