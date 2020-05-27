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
  console.log("Fetching prompt states");
  const promptStates = await userClient.getPromptStates({
    provenanceType: PromptProvenanceType.Note,
  });
  console.log(`Fetched ${promptStates.length} prompt states`);
  const promptStatesToStore: {
    promptStateCache: PromptStateCache;
    ITPrompt: IT.Prompt;
  }[] = [];

  // Get prompt contents for all the prompts we have cached.
  const promptMap = new Map<PromptID, IT.Prompt>();
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
        const ITPrompt = await importCache.getPromptByID(promptID);
        if (ITPrompt) {
          promptMap.set(promptID, ITPrompt);
          promptStatesToStore.push({ promptStateCache, ITPrompt });
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
    const promptsToStore: {
      promptID: PromptID;
      ITPrompt: IT.Prompt;
    }[] = [];
    for (const [promptID, prompt] of remotePromptMap) {
      if (prompt) {
        const ITPrompt = getITPromptForOrbitPrompt(prompt);
        if (ITPrompt) {
          promptMap.set(promptID, ITPrompt);
          promptsToStore.push({ promptID, ITPrompt });
          promptStatesToStore.push({
            promptStateCache: missingPromptIDs.get(promptID)!,
            ITPrompt,
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

    // Now we can store the prompt states we received.
    await importCache.storePrompts(promptsToStore);
    console.log(`Stored ${promptsToStore.length} prompt states`);
  }

  // Now we can save the prompt states.
  importCache.storePromptStateCaches(promptStatesToStore);
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
      const prompt = await importCache.getPromptByCSTPromptID(path[0], path[1]);
      if (prompt) {
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
      noteID: noteData.externalNoteID.id,
      noteTitle: noteData.noteTitle,
      noteURL: noteData.externalNoteID.openURL,
      noteModificationTimestampMillis: noteData.modificationTimestamp,
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
  function addNoteDataToLog(noteData: notePrompts.PromptTaskNoteData) {
    log += `\n\t${noteData.noteTitle} :: ${noteData.externalNoteID?.type}/${noteData.externalNoteID?.id}/${noteData.externalNoteID?.openURL} :: ${noteData.modificationTimestamp}`;
  }

  if (path.length === 1) {
    if (
      change.type === "update" &&
      change.record.type === "collection" &&
      change.record.value.type === "note"
    ) {
      // TODO: Implement note metadata update
      addNoteDataToLog(change.record.value);
      console.log(log);
    } else if (change.type === "delete") {
      const noteData = await importCache.getNoteMetadata(path[0]);
      if (noteData) {
        const updateLists = await Promise.all(
          noteData.childIDs.map((childID) =>
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
        console.error(
          `Couldn't delete ${path} because no remote entry with that ID exists`,
        );
      }
    }
  } else if (path.length === 2) {
    if (change.type === "insert") {
      const value = change.record.value;
      if (
        (change.record.type === "task" && value.type === "qaPrompt") ||
        value.type === "clozeBlock"
      ) {
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
    } else if (change.type === "delete") {
      const ITPrompt = await importCache.getPromptByCSTPromptID(
        path[0],
        path[1],
      );
      const noteMetadata = await importCache.getNoteMetadata(path[0]);
      if (ITPrompt && noteMetadata) {
        const orbitPrompt = getOrbitPromptForITPrompt(ITPrompt);
        return {
          logs: mapTasksInPrompt(ITPrompt, orbitPrompt, (promptTaskID) => ({
            actionLogType: updateMetadataActionLogType,
            updates: { isDeleted: true },
            taskID: promptTaskID,
            timestampMillis,
            parentActionLogIDs: noteMetadata.metadata.headActionLogIDs,
          })),
          prompts: [],
        };
      } else {
        console.error(
          `Couldn't delete ${path}: no remote entry exists at that path`,
        );
      }
    } else if (change.type === "update") {
      log += `\n\tUPDATE SHOULD NOT BE POSSIBLE`;
      console.error(log);
    }
  }

  return { logs: [], prompts: [] };
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
