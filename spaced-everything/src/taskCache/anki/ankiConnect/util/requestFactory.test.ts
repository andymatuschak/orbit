import { processor } from "incremental-thinking";
import { findAllPrompts } from "incremental-thinking/dist/prompt";
import { getIDForPrompt } from "../../../notePrompts";
import { AnkiNoteID } from "../../dataModel";
import {
  addNotes,
  deleteAnkiNoteIDs,
  findAllPromptAnkiNoteIDs,
  getAnkiNoteIDsForSubtree,
  getAnkiNotes,
  updateAnkiNote
} from "./requestFactory";

const clozePrompt = findAllPrompts(
  processor.parse("Testing {cloze} prompts")
)[0];

test("addNotes request", () => {
  const request = addNotes(
    [
      {
        prompt: clozePrompt,
        path: ["test.md", "abc"],
        noteData: {
          externalNoteID: { id: "abc", type: "test", openURL: null },
          noteTitle: "test note title",
          modificationTimestamp: 456
        }
      }
    ],
    "Default"
  );
  expect(request).toMatchSnapshot();
});

test("getAnkiNoteIDsForSubtree request", () => {
  const request = getAnkiNoteIDsForSubtree([
    "test.md",
    getIDForPrompt(clozePrompt)
  ]);
  expect(request).toMatchSnapshot();
});

test("deleteAnkiNoteIDs", () => {
  expect(
    deleteAnkiNoteIDs([123 as AnkiNoteID, 456 as AnkiNoteID])
  ).toMatchSnapshot();
});

test("findAllPromptAnkiNoteIDs", () => {
  expect(findAllPromptAnkiNoteIDs()).toMatchSnapshot();
});

test("getAnkiNotes", () => {
  expect(
    getAnkiNotes([123 as AnkiNoteID, 456 as AnkiNoteID])
  ).toMatchSnapshot();
});

test("updateAnkiNote", () => {
  expect(
    updateAnkiNote(123 as AnkiNoteID, {
      prompt: clozePrompt,
      path: ["test.md", "abc"],
      noteData: {
        noteTitle: "test title",
        externalNoteID: {
          type: "test",
          id: "abc",
          openURL: "http://test.com"
        },
        modificationTimestamp: 456
      }
    })
  ).toMatchSnapshot();
});
