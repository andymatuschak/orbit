import fs from "fs";
import {
  ClozePrompt,
  clozePromptType,
  findAllPrompts,
  getClozeNodesInClozePrompt,
  getNoteID,
  getNoteTitle,
  NoteID,
  processor,
  Prompt,
  QAPrompt,
  qaPromptType,
} from "incremental-thinking";
import isEqual from "lodash.isequal";
import mdast from "mdast";
import uuid from "uuid/v5";
import vfile from "vfile";
import { JsonMap } from "../../util/JSONTypes";
import unreachableCaseError from "../../util/unreachableCaseError";
import { TaskID, TaskIDPath } from "../taskCache";
import {
  Task,
  TaskCollection,
  TaskCollectionRecord,
  TaskRecord,
  TaskSource,
} from "../taskSource";

export type PromptTask =
  | (Task &
      JsonMap & {
        type: "cloze";
      })
  | {
      type: "qaPrompt";
      prompt: QAPrompt & JsonMap;
      noteData: PromptTaskNoteData;
    };

export type PromptTaskCollection = TaskCollection &
  (
    | { type: "root" }
    | ({ type: "note" } & PromptTaskNoteData)
    | {
        type: "clozeBlock";
        prompt: ClozePrompt;
        noteData: PromptTaskNoteData;
      }
  ) &
  JsonMap;

export interface PromptTaskNoteData extends JsonMap {
  modificationTimestamp: number;
  noteTitle: string | null;
  externalNoteID: NoteID | null;
}

async function readNote(notePath: string): Promise<mdast.Root> {
  const noteContents = await fs.promises.readFile(notePath, "utf-8");
  const noteVfile = vfile({ path: notePath, contents: noteContents });
  return (await processor.run(await processor.parse(noteVfile))) as mdast.Root;
}

export function getPrompts(noteAST: mdast.Root): RegisteredPrompt[] {
  return findAllPrompts(noteAST).map((prompt) => ({
    ...prompt,
    id: getIDForPrompt(prompt),
  }));
}

const namespaceUUID = "ddcdb44b-a586-4757-912c-cd34876c6dc7";
export function getIDForPrompt(prompt: Prompt): string {
  if (prompt.type === clozePromptType) {
    return uuid(processor.stringify(prompt.block), namespaceUUID);
  } else if (prompt.type === qaPromptType) {
    return uuid(
      processor.stringify(prompt.question) + processor.stringify(prompt.answer),
      namespaceUUID
    );
  } else {
    throw unreachableCaseError(prompt);
  }
}

export function getClozeNoteTaskCollectionChildIDsForClozePrompt(
  prompt: ClozePrompt
): Set<TaskID> {
  const clozeSpans = getClozeNodesInClozePrompt(prompt);
  const promptID = getIDForPrompt(prompt);

  return new Set(
    Array.from(new Array(clozeSpans.length).keys()).map(
      (i) => `${promptID}-${i}`
    )
  );
}

type RegisteredPrompt = Prompt & { id: string };

interface NoteFileRecord {
  prompts: { [key: string]: RegisteredPrompt };
  modificationTimestamp: number;
  title: string | null;
  id: (NoteID & JsonMap) | null;
}

async function readNoteFileRecord(
  fullPath: string
): Promise<NoteFileRecord | null> {
  try {
    const [noteAST, fileStats] = await Promise.all([
      readNote(fullPath),
      fs.promises.stat(fullPath),
    ]);

    const prompts: NoteFileRecord["prompts"] = {};
    for (const prompt of getPrompts(noteAST)) {
      const id = getIDForPrompt(prompt);
      prompts[id] = { ...prompt, id };
    }

    return {
      prompts,
      modificationTimestamp: fileStats.mtimeMs,
      title: getNoteTitle(noteAST),
      id: getNoteID(noteAST),
    };
  } catch (error) {
    console.debug(`Error reading ${fullPath}: ${error}`);
    return null;
  }
}

// TODO: we should structure this to avoid reading every note in the common case
async function readNotes(
  notePaths: string[]
): Promise<Map<string, NoteFileRecord>> {
  const cache: Map<string, NoteFileRecord> = new Map();
  console.info(`Parsing ${notePaths.length} notes...`);
  const startTimestamp = Date.now();
  await Promise.all(
    notePaths.map(async (notePath) => {
      const record = await readNoteFileRecord(notePath);
      if (record) {
        const effectiveID = record.id?.id ?? notePath;
        cache.set(effectiveID, record);
      }
    })
  );
  console.log(`Finished in ${(Date.now() - startTimestamp) / 1000} seconds`);
  return cache;
}

export function createTaskSource(
  notePaths: string[]
): TaskSource<PromptTask, PromptTaskCollection> {
  return {
    async performOperations(continuation): Promise<unknown> {
      const cache = await readNotes(notePaths);

      return continuation({
        async getTaskNodes<Paths extends TaskIDPath[]>(
          paths: Paths
        ): Promise<
          Map<
            Paths[number],
            TaskRecord<PromptTask, PromptTaskCollection> | null
          >
        > {
          const outputMap: Map<
            Paths[number],
            TaskRecord<PromptTask, PromptTaskCollection> | null
          > = new Map();

          // TODO parallelize by aggregating across lengths
          for (const promptPath of paths) {
            if (promptPath.length === 0) {
              outputMap.set(promptPath, {
                childIDs: new Set(cache.keys()),
                type: "collection",
                value: { type: "root" },
              });
            } else if (promptPath.length <= 3) {
              const noteFileRecord = cache.get(promptPath[0]) ?? null;
              if (noteFileRecord === null) {
                outputMap.set(promptPath, null);
              } else if (promptPath.length === 1) {
                outputMap.set(promptPath, {
                  childIDs: new Set(Object.keys(noteFileRecord.prompts)),
                  type: "collection",
                  value: {
                    type: "note",
                    modificationTimestamp: noteFileRecord.modificationTimestamp,
                    noteTitle: noteFileRecord.title,
                    externalNoteID: noteFileRecord.id,
                  },
                } as TaskCollectionRecord<PromptTaskCollection>);
              } else if (promptPath.length === 2) {
                const prompt = noteFileRecord.prompts[promptPath[1]] || null;
                const noteData: PromptTaskNoteData = {
                  modificationTimestamp: noteFileRecord.modificationTimestamp,
                  noteTitle: noteFileRecord.title,
                  externalNoteID: noteFileRecord.id,
                };
                if (prompt === null) {
                  outputMap.set(promptPath, null);
                } else if (prompt.type === clozePromptType) {
                  outputMap.set(promptPath, {
                    type: "collection",
                    childIDs: getClozeNoteTaskCollectionChildIDsForClozePrompt(
                      prompt
                    ),
                    value: {
                      type: "clozeBlock",
                      prompt,
                      noteData,
                    },
                  });
                } else if (prompt.type === qaPromptType) {
                  outputMap.set(promptPath, {
                    type: "task",
                    value: {
                      type: "qaPrompt",
                      prompt,
                      noteData,
                    },
                  });
                } else {
                  throw unreachableCaseError(prompt);
                }
              } else if (promptPath.length === 3) {
                const prompt = noteFileRecord.prompts[promptPath[1]];
                if (prompt.type === clozePromptType) {
                  outputMap.set(promptPath, {
                    type: "task",
                    value: {
                      type: "cloze",
                    },
                  });
                } else if (prompt.type === qaPromptType) {
                  throw new Error(`Unexpected QA prompt at path ${promptPath}`);
                } else {
                  throw unreachableCaseError(prompt);
                }
              }
            } else {
              throw new Error(`Unsupported path: ${promptPath}`);
            }
          }
          return outputMap;
        },

        isCacheHit(cacheRecord, testRecord): boolean {
          if (cacheRecord.type === "task" && testRecord.type === "task") {
            return true;
          } else if (
            cacheRecord.type === "collection" &&
            testRecord.type === "collection"
          ) {
            const cacheValue = cacheRecord.value;
            const testValue = testRecord.value;
            if (cacheValue.type === "root" && testValue.type === "root") {
              return false;
            } else if (
              cacheValue.type === "note" &&
              testValue.type === "note"
            ) {
              return isEqual(cacheValue, testValue);
            } else if (
              cacheValue.type === "clozeBlock" &&
              testValue.type === "clozeBlock"
            ) {
              return (
                getIDForPrompt(cacheValue.prompt) ===
                getIDForPrompt(testValue.prompt)
              );
            }
          }
          return false;
        },
      });
    },
  };
}
