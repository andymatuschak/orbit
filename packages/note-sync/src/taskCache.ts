import {
  EntityType,
  Event,
  EventType,
  generateUniqueID,
  Task,
  TaskID,
  TaskIngestEvent,
  TaskProvenance,
  TaskUpdateDeletedEvent,
  TaskUpdateProvenanceEvent,
} from "@withorbit/core";
import { Database } from "@withorbit/store-shared";
import * as IT from "incremental-thinking";
import * as spacedEverything from "spaced-everything";
import {
  getITPromptForOrbitTaskSpec,
  getOrbitTaskSpecForITPrompt,
} from "./cstOrbitAdapters";

type NotePromptTask = spacedEverything.notePrompts.PromptTask;
type NotePromptTaskCollection =
  spacedEverything.notePrompts.PromptTaskCollection;

function approximatePromptTaskNoteData(
  noteID: string,
  provenance: TaskProvenance,
): spacedEverything.notePrompts.PromptTaskNoteData {
  return {
    modificationTimestamp: 0, // not bothering with this performance optimization
    noteTitle: provenance.title ?? null,
    externalNoteID: {
      type: "bear", // TODO HACK I'm hardcoding Bear here
      id: noteID,
      openURL: provenance.url ?? null,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function unreachableCaseError(_: never): Error {
  return new Error("unreachable");
}

export interface ImportCache {
  noteRecordsByNoteID: Map<string, ImportCacheNoteRecord>;
  ITPromptsByCSTID: Map<string, IT.Prompt>;
  taskIDsByCSTID: Map<string, TaskID>;
}

interface ImportCacheNoteRecord {
  provenance: TaskProvenance;
  childIDs: string[];
}

function isTaskImportedFromNote(task: Task): boolean {
  // TODO: HACK we'll want to use a metadata key on the task instead.
  return task.provenance?.url?.startsWith("bear://") ?? false;
}

export async function createImportCache(
  database: Database,
): Promise<ImportCache> {
  const noteRecordsByNoteID = new Map<string, ImportCacheNoteRecord>();
  const ITPromptsByCSTID = new Map<string, IT.Prompt>();
  const taskIDsByCSTID = new Map<string, TaskID>();

  let afterID: TaskID | undefined = undefined;
  do {
    const tasks: Task[] = await database.listEntities({
      entityType: EntityType.Task,
      afterID,
      limit: 1000,
    });

    for (const task of tasks) {
      if (!task.provenance) {
        continue; // must not be imported from a note.
      }
      if (!isTaskImportedFromNote(task)) {
        continue;
      }
      if (task.isDeleted) {
        continue;
      }

      const ITPrompt = getITPromptForOrbitTaskSpec(task.spec);
      if (!ITPrompt) {
        continue;
      }

      const CSTID = spacedEverything.notePrompts.getIDForPrompt(ITPrompt);
      ITPromptsByCSTID.set(CSTID, ITPrompt);
      taskIDsByCSTID.set(CSTID, task.id);

      const priorNoteRecord = noteRecordsByNoteID.get(
        task.provenance.identifier,
      );
      if (priorNoteRecord) {
        noteRecordsByNoteID.set(task.provenance.identifier, {
          provenance: priorNoteRecord.provenance,
          childIDs: [...priorNoteRecord.childIDs, CSTID],
        });
      } else {
        noteRecordsByNoteID.set(task.provenance.identifier, {
          provenance: task.provenance,
          childIDs: [CSTID],
        });
      }
    }

    if (tasks.length > 0) {
      afterID = tasks[tasks.length - 1].id;
    } else {
      break;
    }
  } while (!!afterID);

  return {
    noteRecordsByNoteID,
    ITPromptsByCSTID,
    taskIDsByCSTID,
  };
}

async function getTaskRecordForPath(
  path: spacedEverything.taskCache.TaskIDPath,
  importCache: ImportCache,
): Promise<spacedEverything.TaskRecord<
  NotePromptTask,
  NotePromptTaskCollection
> | null> {
  switch (path.length) {
    case 0:
      // Root.
      return {
        type: "collection",
        value: { type: "root" },
        childIDs: new Set(importCache.noteRecordsByNoteID.keys()),
      };

    case 1:
      // Note.
      const noteRecord = importCache.noteRecordsByNoteID.get(path[0]);
      if (noteRecord) {
        return {
          type: "collection",
          value: {
            type: "note",
            ...approximatePromptTaskNoteData(path[0], noteRecord.provenance),
          },
          childIDs: new Set(noteRecord.childIDs),
        };
      } else {
        return null;
      }

    case 2:
      // Prompt or Cloze block.
      const ITPrompt = importCache.ITPromptsByCSTID.get(path[1]);
      if (ITPrompt) {
        const noteRecord = importCache.noteRecordsByNoteID.get(path[0]);
        if (noteRecord) {
          const noteData = approximatePromptTaskNoteData(
            path[0],
            noteRecord.provenance,
          );
          switch (ITPrompt.type) {
            case IT.qaPromptType:
              return {
                type: "task",
                value: {
                  type: "qaPrompt",
                  prompt: ITPrompt,
                  noteData,
                },
              };
            case IT.clozePromptType:
              return {
                type: "collection",
                value: {
                  type: "clozeBlock",
                  prompt: ITPrompt,
                  noteData,
                },
                childIDs:
                  spacedEverything.notePrompts.getClozeNoteTaskCollectionChildIDsForClozePrompt(
                    ITPrompt,
                  ),
              };
            default:
              throw unreachableCaseError(ITPrompt);
          }
        } else {
          console.warn(
            `Inconsistent state: task with path ${path}, but we have no data on note ${path[0]}`,
          );
          return null;
        }
      } else {
        return null;
      }

    case 3:
      // Cloze unit.
      return {
        type: "task",
        value: {
          type: "cloze",
        },
      };

    default:
      console.warn(`Unparsable path: ${path}`);
      return null;
  }
}

function getProvenanceForNoteData(
  noteData: spacedEverything.notePrompts.PromptTaskNoteData,
): TaskProvenance | null {
  if (!noteData.externalNoteID || !noteData.noteTitle) {
    return null;
  } else {
    return {
      identifier: noteData.externalNoteID.id,
      title: noteData.noteTitle,
      ...(noteData.externalNoteID.openURL && {
        url: noteData.externalNoteID.openURL,
      }),
    };
  }
}

async function getChildUpdatesForPromptsInNote(
  noteID: string,
  change: spacedEverything.taskCache.TaskCacheSessionChange<
    NotePromptTask,
    NotePromptTaskCollection
  >,
  timestampMillis: number,
  importCache: ImportCache,
): Promise<Event[]> {
  const noteRecord = await importCache.noteRecordsByNoteID.get(noteID);
  if (noteRecord) {
    const eventLists = await Promise.all(
      noteRecord.childIDs.map((childID) =>
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        getEventsForTaskCacheChange(
          {
            ...change,
            path: [...change.path, childID],
          },
          timestampMillis,
          importCache,
        ),
      ),
    );
    return eventLists.flat();
  } else {
    throw new Error(`Unknown note ID: ${noteID}`);
  }
}

export async function getEventsForTaskCacheChange(
  change: spacedEverything.taskCache.TaskCacheSessionChange<
    NotePromptTask,
    NotePromptTaskCollection
  >,
  timestampMillis: number,
  importCache: ImportCache,
): Promise<Event[]> {
  const path = change.path;
  let log = `${change.path}: ${change.type}`;

  if (path.length === 1) {
    if (
      change.type === "update" &&
      change.record.type === "collection" &&
      change.record.value.type === "note"
    ) {
      // Should we bother to update?
      const noteMetadata = await importCache.noteRecordsByNoteID.get(path[0]);
      if (
        noteMetadata?.provenance.title !== change.record.value.noteTitle ||
        noteMetadata?.provenance.url !==
          change.record.value.externalNoteID?.openURL
      ) {
        const newNoteData = change.record.value;
        log += `\n\tOld metadata: ${noteMetadata?.provenance.title} :: ${noteMetadata?.provenance.url}`;
        log += `\n\tNew metadata: ${newNoteData.noteTitle} :: ${newNoteData.externalNoteID?.type}/${newNoteData.externalNoteID?.id}/${newNoteData.externalNoteID?.openURL} :: ${newNoteData.modificationTimestamp}`;
        console.log(log);
        return getChildUpdatesForPromptsInNote(
          path[0],
          change,
          timestampMillis,
          importCache,
        ).catch((error) => {
          console.error(`Couldn't update note ${path[0]}: ${error}`);
          return [];
        });
      }
    } else if (change.type === "delete") {
      // TODO: don't delete multiply-included prompts
      console.log(log);
      return getChildUpdatesForPromptsInNote(
        path[0],
        change,
        timestampMillis,
        importCache,
      ).catch(() => {
        console.error(
          `Couldn't delete note ${path[0]} because no remote entry with that ID exists`,
        );
        return [];
      });
    }
  } else if (path.length === 2) {
    const existingPromptRecord = await importCache.ITPromptsByCSTID.get(
      path[1],
    );
    if (change.type === "insert") {
      const value = change.record.value;
      if (
        (change.record.type === "task" && value.type === "qaPrompt") ||
        value.type === "clozeBlock"
      ) {
        if (existingPromptRecord) {
          // The prompt might exist in multiple notes, in which case we won't insert it again in the second place.
          return [];
        } else {
          const provenance = getProvenanceForNoteData(value.noteData);
          if (provenance) {
            const spec = getOrbitTaskSpecForITPrompt(value.prompt);
            const ingestEvent: TaskIngestEvent = {
              id: generateUniqueID(),
              type: EventType.TaskIngest,
              spec,
              entityID: generateUniqueID(),
              timestampMillis,
              provenance,
            };
            return [ingestEvent];
          } else {
            console.warn(
              `Skipping ${path} ${value.noteData.noteTitle} because its metadata is invalid`,
            );
          }
        }
      }
    } else if (change.type === "delete") {
      if (existingPromptRecord) {
        const taskID = importCache.taskIDsByCSTID.get(path[1]);
        if (!taskID) {
          throw new Error(
            `Inconsistency: no Orbit task ID for CSTID ${path[1]}`,
          );
        }
        const deleteEvent: TaskUpdateDeletedEvent = {
          id: generateUniqueID(),
          type: EventType.TaskUpdateDeleted,
          isDeleted: true,
          timestampMillis,
          entityID: taskID,
        };
        return [deleteEvent];
      } else {
        console.error(
          `Couldn't delete ${path}: no remote entry exists at that path`,
        );
      }
    } else if (change.type === "update") {
      const value = change.record.value;
      // This is a bit of a hack: we handle note updates by recursing down to the children.
      if (value.type === "note") {
        if (existingPromptRecord) {
          const taskID = importCache.taskIDsByCSTID.get(path[1]);
          if (!taskID) {
            throw new Error(
              `Inconsistency: no Orbit task ID for CSTID ${path[1]}`,
            );
          }
          const updateProvenanceEvent: TaskUpdateProvenanceEvent = {
            id: generateUniqueID(),
            type: EventType.TaskUpdateProvenanceEvent,
            provenance: getProvenanceForNoteData(value),
            timestampMillis,
            entityID: taskID,
          };
          return [updateProvenanceEvent];
        } else {
          console.error(
            `Couldn't update ${path}: no existing entry exists at that path`,
          );
        }
      } else {
        console.error(
          `Unexpected update: ${JSON.stringify(change, null, "\t")}`,
        );
      }
    } else if (change.type === "move") {
      // TODO implement move...
      console.log(`UNIMPLEMENTED MOVE: ${JSON.stringify(change, null, "\t")}`);
    } else {
      throw unreachableCaseError(change);
    }
  }

  return [];
}

export function createTaskCache(
  importCache: ImportCache,
  database: Database,
): spacedEverything.taskCache.TaskCache<
  NotePromptTask,
  NotePromptTaskCollection
> {
  return {
    async performOperations(continuation) {
      // Index by task ID paths.
      return continuation({
        async getTaskNodes(paths) {
          const outputMap = new Map<
            typeof paths[number],
            spacedEverything.TaskRecord<
              NotePromptTask,
              NotePromptTaskCollection
            > | null
          >();

          await Promise.all(
            paths.map(async (path) => {
              const record = await getTaskRecordForPath(path, importCache);
              outputMap.set(path, record);
            }),
          );

          return outputMap;
        },

        async writeChanges(changes) {
          const updateTimestamp = Date.now();
          const events = (
            await Promise.all(
              changes.map((change) =>
                getEventsForTaskCacheChange(
                  change,
                  updateTimestamp,
                  importCache,
                ),
              ),
            )
          ).flat();
          console.log(JSON.stringify(events, null, "\t"));

          const deletions = events.filter(
            (l) => l.type === EventType.TaskUpdateDeleted,
          );
          const insertions = events.filter(
            (l) => l.type === EventType.TaskIngest,
          );
          console.log(
            `${insertions.length} insertions; ${deletions.length} deletions`,
          );

          await database.putEvents(events);
        },
      });
    },
  };
}
