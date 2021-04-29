import * as fs from "fs";

import { AnyJson } from "../util/JSONTypes";
import unreachableCaseError from "../util/unreachableCaseError";
import { TaskCache, TaskID, TaskIDPath } from "./taskCache";
import {
  Task,
  TaskCollection,
  TaskRecord,
  TaskSourceSession,
} from "./taskSource";

export type JSONCacheNode<
  T extends Task & AnyJson,
  TC extends TaskCollection & AnyJson
> = { type: "task"; value: T & Task } | JSONCacheCollectionNode<T, TC>;

export type JSONCacheCollectionNode<
  T extends Task & AnyJson,
  TC extends TaskCollection & AnyJson
> = {
  type: "collection";
  value: TC;
  children: { [key: string]: JSONCacheNode<T, TC> };
};

export function getNodeFromInMemoryCache<
  T extends Task & AnyJson,
  TC extends TaskCollection & AnyJson
>(
  path: TaskIDPath,
  cache: JSONInMemoryCache<T, TC>,
): JSONCacheNode<T, TC> | null {
  return path.reduce((node: JSONCacheNode<T, TC> | null, component) => {
    if (node === null) {
      return null;
    } else if (node.type === "collection") {
      return node.children[component] || null;
    } else {
      return null;
    }
  }, cache.rootNode);
}

async function getTaskNodes<
  Paths extends TaskIDPath[],
  T extends Task & AnyJson,
  TC extends TaskCollection & AnyJson
>(
  paths: Paths,
  cache: JSONInMemoryCache<T, TC>,
): ReturnType<TaskSourceSession<T, TC>["getTaskNodes"]> {
  return new Map(
    paths.map((path): [TaskIDPath, TaskRecord<T, TC> | null] => {
      const node = getNodeFromInMemoryCache(path, cache);
      if (node === null) {
        return [path, null];
      }
      if (node.type === "collection") {
        return [
          path,
          {
            type: "collection",
            childIDs: new Set(Object.keys(node.children)),
            value: node.value,
          },
        ];
      } else {
        return [
          path,
          {
            type: "task",
            value: node.value,
          },
        ];
      }
    }),
  );
}

export type JSONInMemoryCache<
  T extends Task & AnyJson,
  TC extends TaskCollection & AnyJson
> = TaskCache<T, TC> & { rootNode: JSONCacheCollectionNode<T, TC> };

export function JSONInMemoryCache<
  T extends Task & AnyJson,
  TC extends TaskCollection & AnyJson
>(initialRootNode: JSONCacheCollectionNode<T, TC>): JSONInMemoryCache<T, TC> {
  const cache: JSONInMemoryCache<T, TC> = {
    rootNode: initialRootNode,
    performOperations: (continuation) => {
      return continuation({
        getTaskNodes: async (paths) => getTaskNodes(paths, cache),

        writeChanges: async (changes) => {
          function insertRecord(
            record: TaskRecord<T, TC>,
            cacheNode: JSONCacheNode<T, TC>,
            leafID: TaskID,
          ) {
            if (cacheNode.type === "task") {
              throw new Error(
                `Can't insert ${JSON.stringify(
                  record,
                )} because its parent-to-be is a task`,
              );
            }

            if (record.type === "task") {
              cacheNode.children[leafID] = record;
            } else {
              cacheNode.children[leafID] = {
                type: "collection",
                value: record.value,
                children: {},
              };
            }
          }

          function deleteRecord(
            parentNode: JSONCacheNode<T, TC>,
            leafID: TaskID,
          ) {
            if (parentNode.type === "task") {
              throw new Error("Expected collection, found task");
            }

            delete parentNode.children[leafID];
          }

          for (const change of changes) {
            if (change.type === "delete") {
              const pathComponents = [...change.path];
              const baseName = pathComponents.pop()!;
              const parentCacheNode = getNodeFromInMemoryCache(
                pathComponents,
                cache,
              );
              if (parentCacheNode === null) {
                throw new Error(`Unknown path: ${pathComponents}`);
              }
              deleteRecord(parentCacheNode, baseName);
            } else if (change.type === "update") {
              const cacheNode = getNodeFromInMemoryCache(change.path, cache);
              if (cacheNode === null) {
                throw new Error(`Unknown path: ${change.path}`);
              }

              cacheNode.value = change.record.value;
            } else if (change.type === "insert") {
              const pathComponents = [...change.path];
              const baseName = pathComponents.pop()!;
              let cacheNode: JSONCacheCollectionNode<T, TC> = cache.rootNode;
              for (const component of pathComponents) {
                if (cacheNode.children[component]) {
                  const childNode = cacheNode.children[component];
                  if (childNode.type === "task") {
                    throw new Error("Expected collection, found task");
                  }
                  cacheNode = childNode;
                } else {
                  throw new Error(
                    `Attempting to insert record at ${change.path}, but ${component} doesn't exist!`,
                  );
                }
              }
              insertRecord(change.record, cacheNode, baseName);
            } else if (change.type === "move") {
              const oldParent = getNodeFromInMemoryCache(
                change.oldPath.slice(0, change.oldPath.length - 1),
                cache,
              );
              if (oldParent === null) {
                throw new Error(
                  `Can't move from ${change.oldPath} to ${change.path} because the old parent doesn't exist`,
                );
              }
              const newParent = getNodeFromInMemoryCache(
                change.path.slice(0, change.path.length - 1),
                cache,
              );
              if (newParent === null) {
                throw new Error(
                  `Can't move from ${change.oldPath} to ${change.path} because the new parent doesn't exist`,
                );
              }

              deleteRecord(
                oldParent,
                change.oldPath[change.oldPath.length - 1],
              );
              insertRecord(
                change.record,
                newParent,
                change.path[change.path.length - 1],
              );
            } else {
              throw unreachableCaseError(change);
            }
          }
        },
      });
    },
  };
  return cache;
}

export default function JSONCache<
  T extends Task & AnyJson,
  TC extends TaskCollection & AnyJson
>(
  path: string,
  initialValue: JSONCacheCollectionNode<T, TC>,
): TaskCache<T, TC> {
  return {
    performOperations: async (continuation) => {
      const cacheFileContents = await fs.promises
        .readFile(path, "utf-8")
        .catch(() => null);

      let cacheRootNode: JSONCacheCollectionNode<T, TC>;
      if (cacheFileContents) {
        cacheRootNode = JSON.parse(cacheFileContents);
      } else {
        cacheRootNode = initialValue;
      }

      const inMemoryCache = JSONInMemoryCache(cacheRootNode);
      await inMemoryCache.performOperations(continuation);

      await fs.promises.writeFile(
        path,
        JSON.stringify(inMemoryCache.rootNode),
        "utf-8",
      );
    },
  };
}
