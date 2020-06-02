import * as IT from "incremental-thinking";
import { MetabookDataClient, MetabookUserClient } from "metabook-client";
import {
  ActionLog,
  basicPromptType,
  clozePromptType,
  getActionLogFromPromptActionLog,
  getIDForPrompt,
  getIDForPromptTask,
  getPromptTaskForID,
  ingestActionLogType,
  Prompt,
  PromptID,
  PromptProvenance,
  PromptProvenanceType,
  PromptTask,
  PromptTaskID,
} from "metabook-core";
import { updateMetadataActionLogType } from "metabook-core/dist/types/actionLog";
import { PromptStateCache } from "metabook-firebase-support";
import { notePrompts, taskCache, TaskRecord } from "spaced-everything";
import SpacedEverythingImportCache, { CachedNoteMetadata } from "./importCache";
import {
  getITPromptForOrbitPrompt,
  getOrbitPromptForITPrompt,
} from "./util/cstOrbitAdapters";

type NotePromptTask = notePrompts.PromptTask;
type NotePromptTaskCollection = notePrompts.PromptTaskCollection;

function flat<T>(lists: T[][]): T[] {
  return lists.reduce((whole, part) => whole.concat(part), []);
}

// When we start up, we'll fetch all remote prompt states we don't already have locally cached. We'll also fetch all the prompt contents we don't have.
async function initializeImportCache(
  userClient: MetabookUserClient,
  importCache: SpacedEverythingImportCache,
  dataClient: MetabookDataClient,
) {
  const latestServerTimestamp = await importCache.getLatestServerTimestamp();
  console.log(
    `Fetching prompt states after ${latestServerTimestamp?.seconds}.${latestServerTimestamp?.nanoseconds}`,
  );
  const promptStates = await userClient.getPromptStates({
    provenanceType: PromptProvenanceType.Note,
    updatedAfterServerTimestamp: latestServerTimestamp ?? undefined,
  });
  console.log(`Fetched ${promptStates.length} prompt states`);
  const promptStatesToStore: {
    promptStateCache: PromptStateCache;
    ITPrompt: IT.Prompt;
    promptID: PromptID;
  }[] = [];

  // Get prompt contents for all the prompts we have cached.
  const missingPromptIDs = new Map<PromptID, PromptStateCache>();
  await Promise.all(
    promptStates.map(async (promptStateCache) => {
      const promptTask = getPromptTaskForID(promptStateCache.taskID);
      if (promptTask instanceof Error) {
        console.log(
          `Skipping unparseable prompt task ID ${promptStateCache.taskID}`,
        );
      } else {
        const promptID = promptTask.promptID;
        const ITPrompt = await importCache.getPromptByOrbitPromptID(promptID);
        if (ITPrompt) {
          promptStatesToStore.push({ promptStateCache, ITPrompt, promptID });
        } else {
          missingPromptIDs.set(promptID, promptStateCache);
        }
      }
    }),
  );

  // If we haven't cached some of these prompts, download their contents now.
  if (missingPromptIDs.size > 0) {
    console.log(`Fetching ${missingPromptIDs.size} missing prompt IDs`);
    const remotePromptMap = await dataClient.getPrompts(
      missingPromptIDs.keys(),
    );
    for (const [promptID, prompt] of remotePromptMap) {
      if (prompt) {
        const ITPrompt = getITPromptForOrbitPrompt(prompt);
        if (ITPrompt) {
          promptStatesToStore.push({
            promptStateCache: missingPromptIDs.get(promptID)!,
            ITPrompt,
            promptID,
          });
        } else {
          console.log(
            `Skipping prompt ID ${promptID} because it could not be converted to an incremental-thinking prompt`,
          );
        }
      } else {
        console.warn(`Couldn't find source record for prompt ID ${promptID}`);
      }
    }
  }

  // Now we can save the prompt states.
  importCache.storePromptStateCaches(promptStatesToStore);
  console.log(`Stored ${promptStatesToStore.length} states`);
}

function approximatePromptTaskNoteData(
  noteID: string,
  cachedNoteMetadata: CachedNoteMetadata,
): notePrompts.PromptTaskNoteData {
  return {
    modificationTimestamp: cachedNoteMetadata.modificationTimestamp,
    noteTitle: cachedNoteMetadata.title,
    externalNoteID: {
      type: "bear", // TODO HACK I'm hardcoding Bear here
      id: noteID,
      openURL: cachedNoteMetadata.URL,
    },
  };
}

function unreachableCaseError(witness: never): Error {
  return new Error("unreachable");
}

async function getTaskRecordForPath(
  path: taskCache.TaskIDPath,
  importCache: SpacedEverythingImportCache,
): Promise<TaskRecord<NotePromptTask, NotePromptTaskCollection> | null> {
  switch (path.length) {
    case 0:
      // Root.
      const noteIDs = await importCache.getNoteIDs();
      return {
        type: "collection",
        value: { type: "root" },
        childIDs: new Set(noteIDs),
      };

    case 1:
      // Note.
      const noteData = await importCache.getNoteMetadata(path[0]);
      if (noteData) {
        return {
          type: "collection",
          value: {
            type: "note",
            ...approximatePromptTaskNoteData(path[0], noteData.metadata),
          },
          childIDs: new Set(noteData.childIDs),
        };
      } else {
        return null;
      }

    case 2:
      // Prompt or Cloze block.
      const promptRecord = await importCache.getPromptRecordByCSTID(path[1]);
      if (promptRecord) {
        const prompt = promptRecord.ITPrompt;
        const cachedNoteData = await importCache.getNoteMetadata(path[0]);
        if (cachedNoteData) {
          const noteData = approximatePromptTaskNoteData(
            path[0],
            cachedNoteData.metadata,
          );
          switch (prompt.type) {
            case IT.qaPromptType:
              return {
                type: "task",
                value: {
                  type: "qaPrompt",
                  prompt,
                  noteData,
                },
              };
            case IT.clozePromptType:
              return {
                type: "collection",
                value: {
                  type: "clozeBlock",
                  prompt,
                  noteData,
                },
                childIDs: notePrompts.getClozeNoteTaskCollectionChildIDsForClozePrompt(
                  prompt,
                ),
              };
            default:
              throw unreachableCaseError(prompt);
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
  noteData: notePrompts.PromptTaskNoteData,
): PromptProvenance | null {
  if (!noteData.externalNoteID || !noteData.noteTitle) {
    return null;
  } else {
    return {
      provenanceType: PromptProvenanceType.Note,
      externalID: noteData.externalNoteID.id,
      title: noteData.noteTitle,
      url: noteData.externalNoteID.openURL,
      modificationTimestampMillis: noteData.modificationTimestamp,
    };
  }
}

function createIngestionLog(
  taskID: PromptTaskID,
  provenance: PromptProvenance,
  timestampMillis: number,
): ActionLog {
  return getActionLogFromPromptActionLog({
    actionLogType: "ingest",
    taskID,
    timestampMillis,
    provenance,
  });
}

function mapTasksInPrompt<R>(
  ITPrompt: IT.Prompt,
  orbitPrompt: Prompt,
  f: (taskID: PromptTaskID) => R,
): R[] {
  const orbitPromptID = getIDForPrompt(orbitPrompt);
  switch (ITPrompt.type) {
    case IT.qaPromptType:
      const promptTask: PromptTask = {
        promptType: basicPromptType,
        promptParameters: null,
        promptID: orbitPromptID,
      };
      return [f(getIDForPromptTask(promptTask))];

    case IT.clozePromptType:
      return Array.from(
        new Array(IT.getClozeNodesInClozePrompt(ITPrompt).length).keys(),
      ).map((index) => {
        const promptTask: PromptTask = {
          promptType: clozePromptType,
          promptParameters: { clozeIndex: index },
          promptID: orbitPromptID,
        };
        return f(getIDForPromptTask(promptTask));
      });
  }
}

async function getChildUpdatesForPromptsInNote(
  noteID: string,
  change: taskCache.TaskCacheSessionChange<
    NotePromptTask,
    NotePromptTaskCollection
  >,
  timestampMillis: number,
  importCache: SpacedEverythingImportCache,
): Promise<{ logs: ActionLog[]; prompts: Prompt[] }> {
  const noteData = await importCache.getNoteMetadata(noteID);
  if (noteData) {
    const updateLists = await Promise.all(
      noteData.childIDs.map((childID) =>
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        getUpdatesForTaskCacheChange(
          {
            ...change,
            path: [...change.path, childID],
          },
          timestampMillis,
          importCache,
        ),
      ),
    );
    return {
      prompts: [],
      logs: flat(updateLists.map((update) => update.logs)),
    };
  } else {
    throw new Error(`Unknown note ID: ${noteID}`);
  }
}

export async function getUpdatesForTaskCacheChange(
  change: taskCache.TaskCacheSessionChange<
    NotePromptTask,
    NotePromptTaskCollection
  >,
  timestampMillis: number,
  importCache: SpacedEverythingImportCache,
): Promise<{ logs: ActionLog[]; prompts: Prompt[] }> {
  const path = change.path;
  let log = `${change.path}: ${change.type}`;
  const emptyResult = { logs: [], prompts: [] };

  if (path.length === 1) {
    if (
      change.type === "update" &&
      change.record.type === "collection" &&
      change.record.value.type === "note"
    ) {
      // Should we bother to update?
      const noteMetadata = await importCache.getNoteMetadata(path[0]);
      if (
        noteMetadata?.metadata.title !== change.record.value.noteTitle ||
        noteMetadata?.metadata.URL !==
          change.record.value.externalNoteID?.openURL
      ) {
        const newNoteData = change.record.value;
        log += `\n\tOld metadata: ${noteMetadata?.metadata.title} :: ${noteMetadata?.metadata.URL}`;
        log += `\n\tNew metadata: ${newNoteData.noteTitle} :: ${newNoteData.externalNoteID?.type}/${newNoteData.externalNoteID?.id}/${newNoteData.externalNoteID?.openURL} :: ${newNoteData.modificationTimestamp}`;
        console.log(log);
        return getChildUpdatesForPromptsInNote(
          path[0],
          change,
          timestampMillis,
          importCache,
        ).catch((error) => {
          console.error(`Couldn't update note ${path[0]}: ${error}`);
          return emptyResult;
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
        return emptyResult;
      });
    }
  } else if (path.length === 2) {
    const existingPromptRecord = await importCache.getPromptRecordByCSTID(
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
          return { logs: [], prompts: [] };
        } else {
          const provenance = getProvenanceForNoteData(value.noteData);
          if (provenance) {
            const orbitPrompt = getOrbitPromptForITPrompt(value.prompt);
            return {
              logs: mapTasksInPrompt(value.prompt, orbitPrompt, (taskID) =>
                createIngestionLog(taskID, provenance, timestampMillis),
              ),
              prompts: [orbitPrompt],
            };
          } else {
            console.warn(
              `Skipping ${path} ${value.noteData.noteTitle} because its metadata is invalid`,
            );
          }
        }
      }
    } else if (change.type === "delete") {
      if (existingPromptRecord) {
        const orbitPrompt = getOrbitPromptForITPrompt(
          existingPromptRecord.ITPrompt,
        );
        return {
          logs: mapTasksInPrompt(
            existingPromptRecord.ITPrompt,
            orbitPrompt,
            (promptTaskID) => ({
              actionLogType: updateMetadataActionLogType,
              updates: { isDeleted: true },
              taskID: promptTaskID,
              timestampMillis,
              parentActionLogIDs: existingPromptRecord.headActionLogIDs,
            }),
          ),
          prompts: [],
        };
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
          const orbitPrompt = getOrbitPromptForITPrompt(
            existingPromptRecord.ITPrompt,
          );
          return {
            logs: mapTasksInPrompt(
              existingPromptRecord.ITPrompt,
              orbitPrompt,
              (promptTaskID) => ({
                actionLogType: updateMetadataActionLogType,
                updates: {
                  provenance: getProvenanceForNoteData(value),
                },
                taskID: promptTaskID,
                timestampMillis,
                parentActionLogIDs: existingPromptRecord.headActionLogIDs,
              }),
            ),
            prompts: [],
          };
        } else {
          console.error(
            `Couldn't update ${path}: no remote entry exists at that path`,
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

  return emptyResult;
}

export function createTaskCache(
  userClient: MetabookUserClient,
  dataClient: MetabookDataClient,
  importCache: SpacedEverythingImportCache,
): taskCache.TaskCache<NotePromptTask, NotePromptTaskCollection> {
  return {
    async performOperations(continuation) {
      await initializeImportCache(userClient, importCache, dataClient);

      // Index by task ID paths.
      return continuation({
        async getTaskNodes(paths) {
          const outputMap = new Map<
            typeof paths[number],
            TaskRecord<NotePromptTask, NotePromptTaskCollection> | null
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
          const updateLists = await Promise.all(
            changes.map((change) =>
              getUpdatesForTaskCacheChange(
                change,
                updateTimestamp,
                importCache,
              ),
            ),
          );

          const logs = flat(updateLists.map((update) => update.logs));
          const prompts = flat(updateLists.map((update) => update.prompts));
          console.log(logs);
          console.log(prompts);

          const deletions = logs.filter(
            (l) => l.actionLogType === updateMetadataActionLogType,
          );
          const insertions = logs.filter(
            (l) => l.actionLogType === ingestActionLogType,
          );
          console.log(
            `${insertions.length} insertions; ${deletions.length} deletions; ${prompts.length} prompts to record`,
          );

          await dataClient.recordPrompts(prompts);
          console.log("Recorded prompts.");

          await userClient.recordActionLogs(logs);
          console.log("Recorded logs.");
          return;
        },
      });
    },
  };
}
