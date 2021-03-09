import { JSONCacheCollectionNode, JSONInMemoryCache } from "../JSONCache";
import { PromptTaskCollection, PromptTaskNoteData } from "../notePrompts";
import { decodeTaskIDPath, encodeTaskIDPath, TaskIDPath } from "../taskCache";
import { AnkiConnectClient } from "./ankiConnect/ankiConnectClient";
import { decodeAnkiPathFieldToTaskIDPath } from "./ankiConnect/util/ankiTextEncoding";
import * as requestFactory from "./ankiConnect/util/requestFactory";
import {
  deleteAnkiNoteIDs,
  getAnkiNoteIDsForSubtree,
  getAnkiNotes,
  getAnkiPromptForAnkiNote,
  updateAnkiNote,
} from "./ankiConnect/util/requestFactory";
import { AnkiNote, AnkiPrompt } from "./dataModel";

export type AnkiClient = AnkiConnectClient;

export function _createTreeFromAnkiNoteList(
  allAnkiNotes: AnkiNote[]
): JSONInMemoryCache<AnkiNote, PromptTaskCollection> {
  const tree = {
    type: "collection",
    value: { type: "root" },
    children: {},
  } as JSONCacheCollectionNode<AnkiNote, PromptTaskCollection>;
  for (const ankiNote of allAnkiNotes) {
    const taskIDPath = decodeAnkiPathFieldToTaskIDPath(ankiNote.fields._Path);
    const ankiPrompt = getAnkiPromptForAnkiNote(ankiNote);

    let currentNode = tree;
    for (const parentPathID of taskIDPath.slice(0, taskIDPath.length - 1)) {
      let newNode = currentNode.children[parentPathID];
      if (newNode && newNode.type !== "collection") {
        throw new Error(
          `Inconsistent Anki database: a task has ID ${parentPathID}, which also appears in path ${encodeTaskIDPath(
            taskIDPath
          )}`
        );
      } else if (!newNode) {
        newNode = {
          type: "collection",
          children: {},
          value: {
            type: "note",
            ...ankiPrompt.noteData,
          },
        };
        currentNode.children[parentPathID] = newNode;
      }
      currentNode = newNode;
    }

    currentNode.children[taskIDPath[taskIDPath.length - 1]] = {
      type: "task",
      value: ankiNote,
    };
  }
  return JSONInMemoryCache(tree);
}

export async function getAllAnkiNotes(
  ankiClient: AnkiClient
): Promise<JSONInMemoryCache<AnkiNote, PromptTaskCollection>> {
  const allNoteIDs = await ankiClient.request(
    requestFactory.findAllPromptAnkiNoteIDs()
  );
  const allAnkiNotes = await ankiClient.request(
    requestFactory.getAnkiNotes(allNoteIDs)
  );

  return _createTreeFromAnkiNoteList(allAnkiNotes);
}

export async function addPrompts(
  ankiClient: AnkiClient,
  ankiPrompts: AnkiPrompt[]
) {
  return ankiClient.request(
    requestFactory.addNotes(ankiPrompts, ankiClient.deckName)
  );
}

export async function deleteNoteSubtrees(
  ankiClient: AnkiClient,
  subtreePaths: TaskIDPath[]
) {
  const nestedIDsToDelete = await Promise.all(
    subtreePaths.map((path) =>
      ankiClient.request(getAnkiNoteIDsForSubtree(path))
    )
  );

  const IDsToDelete = nestedIDsToDelete.reduce(
    (flatIDs, subtreeIDs) => [...flatIDs, ...subtreeIDs],
    []
  );
  await ankiClient.request(deleteAnkiNoteIDs(IDsToDelete));
}

export async function movePrompts(
  ankiClient: AnkiClient,
  ankiPrompts: (AnkiPrompt & {
    oldPath: TaskIDPath;
  })[]
) {
  const noteIDs = await Promise.all(
    ankiPrompts.map(async (ankiPrompt) => {
      const matchingNoteIDs = await ankiClient.request(
        getAnkiNoteIDsForSubtree(ankiPrompt.oldPath)
      );
      if (matchingNoteIDs.length === 1) {
        return matchingNoteIDs[0];
      } else {
        if (matchingNoteIDs.length === 0) {
          console.warn(
            "Attempting to update note but it does not exist in Anki",
            ankiPrompt
          );
        } else {
          console.error(
            "Attempting to update note but Anki returned multiple matching notes",
            ankiPrompt,
            matchingNoteIDs
          );
        }
        return null;
      }
    })
  );

  await Promise.all(
    noteIDs.map((noteID, index) =>
      noteID
        ? ankiClient.request(updateAnkiNote(noteID, ankiPrompts[index]))
        : Promise.resolve(undefined)
    )
  );
}

export async function updateNoteDatas(
  ankiClient: AnkiClient,
  changedNoteRecords: { notePath: TaskIDPath; noteData: PromptTaskNoteData }[]
) {
  const ankiNoteLists = await Promise.all(
    changedNoteRecords.map(async (changedNoteRecord) => {
      const matchingNoteIDs = await ankiClient.request(
        getAnkiNoteIDsForSubtree(changedNoteRecord.notePath)
      );
      if (matchingNoteIDs.length === 0) {
        console.warn(
          "Attempting to update note but it does not exist in Anki",
          changedNoteRecord
        );
      }
      return await ankiClient.request(getAnkiNotes(matchingNoteIDs));
    })
  );

  await Promise.all(
    ankiNoteLists
      .map((ankiNoteList, index) => {
        const newNoteData = changedNoteRecords[index].noteData;
        return ankiNoteList.map((ankiNote) => {
          const newAnkiPrompt = {
            ...getAnkiPromptForAnkiNote(ankiNote),
            noteData: newNoteData,
          };
          return ankiClient.request(
            updateAnkiNote(ankiNote.noteId, newAnkiPrompt)
          );
        });
      })
      .reduce((a, l) => [...a, ...l], [])
  );
}
