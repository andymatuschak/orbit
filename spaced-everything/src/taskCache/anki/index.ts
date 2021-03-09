import { clozePromptType, qaPromptType } from "incremental-thinking";
import unreachableCaseError from "../../util/unreachableCaseError";
import { getNodeFromInMemoryCache, JSONInMemoryCache } from "../JSONCache";
import {
  getClozeNoteTaskCollectionChildIDsForClozePrompt,
  PromptTask,
  PromptTaskCollection,
  PromptTaskNoteData
} from "../notePrompts";
import {
  TaskCache,
  TaskCacheSessionChange,
  TaskID,
  TaskIDPath
} from "../taskCache";
import { TaskRecord } from "../taskSource";
import {
  getAnkiPromptForAnkiNote,
  sync
} from "./ankiConnect/util/requestFactory";
import { AnkiNote, AnkiPrompt } from "./dataModel";
import {
  addPrompts,
  AnkiClient,
  deleteNoteSubtrees,
  getAllAnkiNotes,
  movePrompts,
  updateNoteDatas
} from "./operations";

type AnkiOperationSet = {
  addPrompts: AnkiPrompt[];
  deleteNoteSubtrees: TaskIDPath[];
  movePrompts: (AnkiPrompt & {
    oldPath: TaskIDPath;
  })[];
  updateNoteDatas: { notePath: TaskIDPath; noteData: PromptTaskNoteData }[];
};

export function _computeAnkiOperationSet(
  changes: TaskCacheSessionChange<PromptTask, PromptTaskCollection>[],
  inMemoryAnkiNoteCache: JSONInMemoryCache<AnkiNote, {}> | null
): AnkiOperationSet {
  const output: AnkiOperationSet = {
    addPrompts: [],
    deleteNoteSubtrees: [],
    movePrompts: [],
    updateNoteDatas: []
  };

  const changedNoteMap: { [key: string]: PromptTaskNoteData } = {};
  for (const change of changes) {
    switch (change.type) {
      case "delete":
        if (change.path.length > 0) {
          output.deleteNoteSubtrees.push(change.path);
        }
        break;
      case "insert":
        const record = change.record;
        if (
          (change.path.length === 2 &&
            record.type === "collection" &&
            record.value.type === "clozeBlock") ||
          (record.type === "task" && record.value.type === "qaPrompt")
        ) {
          output.addPrompts.push({
            path: change.path,
            prompt: record.value.prompt,
            noteData: record.value.noteData
          });
        } else if (
          record.type === "collection" &&
          record.value.type === "note"
        ) {
          changedNoteMap[change.path[change.path.length - 1]] = record.value;
        }
        break;
      case "update":
        if (change.path.length > 1) {
          throw new Error(
            `Unimplemented and should not occur: ${JSON.stringify(change)}`
          );
        } else if (change.path.length === 1) {
          if (
            change.record.type !== "collection" ||
            change.record.value.type !== "note"
          ) {
            throw new Error(
              `Unimplemented update: ${JSON.stringify(change, null, "\t")}`
            );
          }
          // TODO ideally pass along the Anki note IDs if we already have them
          output.updateNoteDatas.push({
            notePath: change.path,
            noteData: change.record.value
          });
        }
        break;
      case "move":
        if (change.path.length !== change.oldPath.length) {
          throw new Error(
            `Unimplemented: moving between paths at different levels ${change.oldPath} -> ${change.path}`
          );
        } else if (
          change.path.length !== 2 ||
          change.oldPath.length !== 2 ||
          change.record.type !== "collection" ||
          change.record.value.type !== "clozeBlock"
        ) {
          throw new Error(
            `Unimplemented; only moving clozeBlock collections is supported ${
              change.oldPath
            } -> ${change.path}; ${JSON.stringify(change.record, null, "\t")}`
          );
        } else if (change.path[1] !== change.oldPath[1]) {
          throw new Error(
            `Unimplemented; can't change leaf ID when moving a cloze block ${change.oldPath} -> ${change.path}`
          );
        }

        output.movePrompts.push({
          prompt: change.record.value.prompt,
          oldPath: change.oldPath,
          path: change.path,
          noteData: change.record.value.noteData
        });
        break;
      default:
        throw unreachableCaseError(change);
    }
  }

  output.deleteNoteSubtrees.sort((a, b) => a.length - b.length);
  const deduplicatedDeletedSubtrees: typeof output.deleteNoteSubtrees = [];
  const deletedSubtreeRootIDs = new Set<TaskID>();
  for (const deletedPath of output.deleteNoteSubtrees) {
    if (deletedPath.filter(id => deletedSubtreeRootIDs.has(id)).length === 0) {
      deletedSubtreeRootIDs.add(deletedPath[deletedPath.length - 1]);
      deduplicatedDeletedSubtrees.push(deletedPath);
    }
  }
  output.deleteNoteSubtrees = deduplicatedDeletedSubtrees;
  return output;
}

async function executeAnkiOperationSet(
  ankiClient: AnkiClient,
  operationSet: AnkiOperationSet
) {
  console.log(
    `Executing Anki operation set: ${JSON.stringify(operationSet, null, "\t")}`
  );
  await Promise.all([
    operationSet.addPrompts.length > 0
      ? addPrompts(ankiClient, operationSet.addPrompts)
      : Promise.resolve(undefined),
    operationSet.deleteNoteSubtrees.length > 0
      ? deleteNoteSubtrees(ankiClient, operationSet.deleteNoteSubtrees)
      : Promise.resolve(undefined),
    operationSet.movePrompts.length > 0
      ? movePrompts(ankiClient, operationSet.movePrompts)
      : Promise.resolve(undefined),
    operationSet.updateNoteDatas.length > 0
      ? updateNoteDatas(ankiClient, operationSet.updateNoteDatas)
      : Promise.resolve(undefined)
  ]);
}

function getNoteDataFromAnkiNote(ankiNote: AnkiNote): PromptTaskNoteData {
  const ankiPrompt = getAnkiPromptForAnkiNote(ankiNote);
  return ankiPrompt.noteData;
}

export function _getPromptRecordFromAnkiNote(
  ankiNote: AnkiNote
): TaskRecord<PromptTask, PromptTaskCollection> {
  const prompt = getAnkiPromptForAnkiNote(ankiNote).prompt;
  const noteData = getNoteDataFromAnkiNote(ankiNote);
  if (prompt.type === clozePromptType) {
    return {
      type: "collection",
      value: {
        type: "clozeBlock",
        prompt,
        noteData: noteData
      },
      childIDs: getClozeNoteTaskCollectionChildIDsForClozePrompt(prompt)
    };
  } else if (prompt.type === qaPromptType) {
    return {
      type: "task",
      value: {
        type: "qaPrompt",
        prompt,
        noteData
      }
    };
  } else {
    throw unreachableCaseError(prompt);
  }
}

export function _getPromptTaskRecordFromAnkiNoteCacheRecord(
  path: TaskIDPath,
  cacheEntry: TaskRecord<AnkiNote, {}> | null,
  inMemoryAnkiNoteCache: JSONInMemoryCache<AnkiNote, {}>
): TaskRecord<PromptTask, PromptTaskCollection> | null {
  if (cacheEntry === null) {
    if (path.length >= 3) {
      // It might be a cloze task entry, the child of a real note. We'll see if the parent fits that description.
      const parentNode = getNodeFromInMemoryCache(
        path.slice(0, path.length - 1),
        inMemoryAnkiNoteCache
      );
      if (parentNode && parentNode.type === "task") {
        const taskRecord = _getPromptRecordFromAnkiNote(parentNode.value);
        if (
          taskRecord.type === "collection" &&
          taskRecord.value.type === "clozeBlock" &&
          taskRecord.childIDs.has(path[path.length - 1])
        ) {
          return { type: "task", value: { type: "cloze" } };
        }
      }
    }
    return null;
  } else if (cacheEntry.type === "task") {
    return _getPromptRecordFromAnkiNote(cacheEntry.value);
  } else if (cacheEntry.type === "collection") {
    let taskCollection: PromptTaskCollection;
    if (path.length === 0) {
      taskCollection = { type: "root" };
    } else {
      // This node represents a note. We have to extract the note's metadata from a leaf node, since Anki has no way to represent collections.
      if (cacheEntry.childIDs.size === 0) {
        throw new Error(
          `Anki cache record at ${path} has no children, but it's a collection`
        );
      }
      const childNode = getNodeFromInMemoryCache(
        [...path, cacheEntry.childIDs.values().next().value!],
        inMemoryAnkiNoteCache
      );
      if (!childNode || childNode.type !== "task") {
        throw new Error(
          `Anki cache collection at ${path} has invalid child ${childNode}`
        );
      }
      const ankiPrompt = getAnkiPromptForAnkiNote(childNode.value);
      taskCollection = {
        type: "note",
        ...ankiPrompt.noteData
      };
    }
    return {
      type: "collection",
      value: taskCollection,
      childIDs: cacheEntry.childIDs
    };
  } else {
    throw unreachableCaseError(cacheEntry);
  }
}

export function createAnkiCache(
  ankiClient: AnkiClient,
  syncToAnkiWebAfterPerformingOperations: boolean
): TaskCache<PromptTask, PromptTaskCollection> {
  return {
    performOperations: async function(continuation): Promise<unknown> {
      const inMemoryAnkiNoteCache = await getAllAnkiNotes(ankiClient);
      const result = await inMemoryAnkiNoteCache.performOperations(
        inMemoryAnkiNoteCacheSession => {
          return continuation({
            async getTaskNodes<Paths extends TaskIDPath[]>(paths: Paths) {
              const cachedNodeMap = await inMemoryAnkiNoteCacheSession.getTaskNodes(
                paths
              );
              return new Map(
                [...cachedNodeMap.entries()].map(([path, cacheEntry]) => [
                  path,
                  _getPromptTaskRecordFromAnkiNoteCacheRecord(
                    path,
                    cacheEntry,
                    inMemoryAnkiNoteCache
                  )
                ])
              );
            },
            async writeChanges(changes) {
              console.log(
                `Writing Anki changes: ${JSON.stringify(changes, null, "\t")}`
              );
              const operationSet = _computeAnkiOperationSet(
                changes,
                inMemoryAnkiNoteCache
              );

              await executeAnkiOperationSet(ankiClient, operationSet);
            }
          });
        }
      );

      if (syncToAnkiWebAfterPerformingOperations) {
        await ankiClient.request(sync());
      }

      return result;
    }
  };
}
