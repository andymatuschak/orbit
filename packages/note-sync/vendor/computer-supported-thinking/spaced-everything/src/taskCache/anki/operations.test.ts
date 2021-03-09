import { PromptTaskNoteData } from "../notePrompts";
import { encodeTaskIDPathToAnkiPathField } from "./ankiConnect/util/ankiTextEncoding";
import { AnkiNote, AnkiNoteID, ankiNoteTag, clozeModelName } from "./dataModel";
import { _createTreeFromAnkiNoteList } from "./operations";

describe("create tree from anki note list", () => {
  test("basic hierarchy", async () => {
    const noteData: PromptTaskNoteData = {
      noteTitle: "First note title",
      modificationTimestamp: 123,
      externalNoteID: null,
    };
    const notes: AnkiNote[] = [
      {
        modelName: clozeModelName,
        tags: [ankiNoteTag],
        noteId: 123 as AnkiNoteID,
        fields: {
          Text: "Test {{c1::cloze}}",
          NoteTitle: "First note title",
          NoteURL: "",
          _Path: encodeTaskIDPathToAnkiPathField(["foo", "bar"]),
          _OriginalMarkdown: "*Test* {cloze}",
          _NoteDataJSON: JSON.stringify(noteData),
        },
      },
      {
        modelName: clozeModelName,
        tags: [ankiNoteTag],
        noteId: 456 as AnkiNoteID,
        fields: {
          Text: "Another test {{c1::cloze}}",
          NoteTitle: "First note title",
          NoteURL: "",
          _Path: encodeTaskIDPathToAnkiPathField(["foo", "baz"]),
          _OriginalMarkdown: "__Another__ test {cloze}",
          _NoteDataJSON: JSON.stringify(noteData),
        },
      },
      {
        modelName: clozeModelName,
        tags: [ankiNoteTag],
        noteId: 789 as AnkiNoteID,
        fields: {
          Text: "Yet another test {{c1::cloze}}",
          NoteTitle: "Second note title",
          NoteURL: "",
          _Path: encodeTaskIDPathToAnkiPathField(["quux", "bat"]),
          _OriginalMarkdown: "Yet another test {cloze}",
          _NoteDataJSON: JSON.stringify({
            noteTitle: "Second note title",
            externalNoteID: null,
            modificationTimestamp: 789,
          } as PromptTaskNoteData),
        },
      },
    ];

    const cache = _createTreeFromAnkiNoteList(notes);
    await cache.performOperations(async (session) => {
      const resultMap = await session.getTaskNodes([
        ["foo", "bar"],
        ["foo", "baz"],
        ["quux", "bat"],
      ]);
      expect(resultMap).toEqual(
        new Map([
          [["foo", "bar"], { type: "task", value: notes[0] }],
          [["foo", "baz"], { type: "task", value: notes[1] }],
          [["quux", "bat"], { type: "task", value: notes[2] }],
        ])
      );
    });
  });
});
