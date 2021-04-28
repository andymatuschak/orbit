import { Opaque } from "../util/opaque";
import {
  Task,
  TaskCollection,
  TaskCollectionRecord,
  TaskRecord,
  TaskSource,
  TaskSourceSession,
} from "./taskSource";

// Every ID (whether it's for a collection or a task) should be globally unique.
export type TaskID = string;

export type TaskIDPath = TaskID[];

export interface TaskCacheSession<T extends Task, TC extends TaskCollection> {
  getTaskNodes<Paths extends TaskIDPath[]>(
    paths: Paths,
  ): Promise<Map<Paths[number], TaskRecord<T, TC> | null>>;
  writeChanges(changes: TaskCacheSessionChange<T, TC>[]): Promise<void>;
}

export type TaskCacheSessionChange<T extends Task, TC extends TaskCollection> =
  | {
      type: "insert";
      path: TaskIDPath;
      record: TaskRecord<T, TC>;
    }
  | {
      type: "update";
      path: TaskIDPath;
      record: TaskRecord<T, TC>;
    }
  | {
      type: "delete";
      path: TaskIDPath;
    }
  | {
      type: "move";
      record: TaskRecord<T, TC>; // the post-move record
      oldPath: TaskIDPath;
      path: TaskIDPath;
    };

export interface TaskCache<T extends Task, TC extends TaskCollection> {
  performOperations(
    continuation: (session: TaskCacheSession<T, TC>) => Promise<unknown>,
  ): Promise<unknown>;
}

export async function _computeCacheDelta<T, TC>(
  cacheSession: TaskCacheSession<T, TC>,
  sourceSession: TaskSourceSession<T, TC>,
): Promise<TaskCacheSessionChange<T, TC>[]> {
  const pathQueue: Set<EncodedTaskIDPath> = new Set([encodeTaskIDPath([])]);
  const outChangeSet: TaskCacheSessionChange<T, TC>[] = [];

  function visitPath(
    path: TaskIDPath,
    cacheRecord: TaskRecord<T, TC> | null,
    sourceRecord: TaskRecord<T, TC> | null,
    isCacheHit: TaskSourceSession<T, TC>["isCacheHit"],
  ) {
    function enqueueSubtree(record: TaskCollectionRecord<TC>) {
      record.childIDs.forEach((childID) =>
        pathQueue.add(encodeTaskIDPath([...path, childID])),
      );
    }

    if (sourceRecord && !cacheRecord) {
      // Insertion
      outChangeSet.push({
        type: "insert",
        path: path,
        record: sourceRecord,
      });
      if (sourceRecord.type === "collection") {
        enqueueSubtree(sourceRecord);
      }
    } else if (!sourceRecord && cacheRecord) {
      // Deletion
      outChangeSet.push({
        type: "delete",
        path: path,
      });
    } else if (sourceRecord && cacheRecord) {
      // Update
      if (cacheRecord.type !== sourceRecord.type) {
        throw new Error(
          `UNIMPLEMENTED: can't handle changes of tasks into collections (or vice versa). Path: ${path}`,
        );
      }

      if (!isCacheHit(cacheRecord, sourceRecord)) {
        outChangeSet.push({
          type: "update",
          path: path,
          record: sourceRecord,
        });

        if (
          sourceRecord.type === "collection" &&
          cacheRecord.type === "collection"
        ) {
          enqueueSubtree(cacheRecord);
          enqueueSubtree(sourceRecord);
        }
      }
    }
  }

  while (pathQueue.size > 0) {
    const paths = [...pathQueue.keys()].map((encodedPath) =>
      decodeTaskIDPath(encodedPath),
    );
    pathQueue.clear();
    const [cacheRecordMap, sourceRecordMap] = await Promise.all([
      cacheSession.getTaskNodes(paths),
      sourceSession.getTaskNodes(paths),
    ]);

    for (const path of paths) {
      const cacheRecord = cacheRecordMap.get(path) || null;
      const sourceRecord = sourceRecordMap.get(path) || null;
      visitPath(
        path,
        cacheRecord,
        sourceRecord,
        sourceSession.isCacheHit.bind(cacheSession),
      );
    }
  }

  // Now we find any nodes which might have been moved.
  const changeByLeafID: {
    [key: string]: TaskCacheSessionChange<T, TC>;
  } = {};
  const changeSetWithMoves: typeof outChangeSet = [];
  for (const change of outChangeSet) {
    if (change.type === "move") {
      throw new Error(
        "Move changes shouldn't ever appear prior to this processing phase.",
      ); // I could use the type system for this, but being a bit sloppy.
    }
    if (change.path.length === 0) {
      changeSetWithMoves.push(change);
    } else {
      const leafID = change.path[change.path.length - 1];
      const existingChange = changeByLeafID[leafID] || null;
      if (existingChange === null) {
        changeByLeafID[leafID] = change;
      } else if (existingChange.type === "delete" && change.type === "insert") {
        changeByLeafID[leafID] = {
          type: "move",
          oldPath: existingChange.path,
          path: change.path,
          record: change.record,
        };
      } else if (existingChange.type === "insert" && change.type === "delete") {
        changeByLeafID[leafID] = {
          type: "move",
          oldPath: change.path,
          path: existingChange.path,
          record: existingChange.record,
        };
      } else {
        console.error(
          `Incompatible changes:`,
          JSON.stringify(change, null, "\t"),
          JSON.stringify(existingChange, null, "\t"),
        );
      }
    }
  }
  return changeSetWithMoves
    .concat(Object.values(changeByLeafID))
    .sort((a, b) => a.path.length - b.path.length);
}

export async function updateTaskCache<
  T extends Task,
  TC extends TaskCollection
>(cache: TaskCache<T, TC>, source: TaskSource<T, TC>) {
  await cache.performOperations(async (cacheSession) => {
    let changes: TaskCacheSessionChange<T, TC>[] | null = null;
    const result = await source.performOperations(async (sourceSession) => {
      changes = await _computeCacheDelta(cacheSession, sourceSession);
    });

    if (changes === null) {
      throw new Error("shouldn't be reachable");
    }
    await cacheSession.writeChanges(changes);
    return result;
  });
}

export type EncodedTaskIDPath = Opaque<string>;

export function encodeTaskIDPath(taskIDPath: TaskIDPath): EncodedTaskIDPath {
  if (taskIDPath.length === 0) {
    return "/" as EncodedTaskIDPath;
  }
  return taskIDPath
    .map((id) => id.replace(/\//g, "\\/"))
    .join("/") as EncodedTaskIDPath;
}

export function decodeTaskIDPath(
  encodedTaskIDPath: EncodedTaskIDPath,
): TaskIDPath {
  if (encodedTaskIDPath === "/") {
    return [];
  } else {
    return encodedTaskIDPath
      .split(/(?<!\\)\//)
      .map((id) => id.replace(/\\\//g, "/"));
  }
}
