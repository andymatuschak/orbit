import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import mockFS from "mock-fs";
import { getItemAtPath } from "../../util/tests/getItemAtPath";
import { JSONInMemoryCache } from "../JSONCache";
import {
  createTaskSource,
  getClozeNoteTaskCollectionChildIDsForClozePrompt,
  getIDForPrompt,
  PromptTaskCollection,
  PromptTaskNoteData,
} from "../notePrompts";
import { _computeCacheDelta, encodeTaskIDPath } from "../taskCache";
import { TaskCollectionRecord } from "../taskSource";
import { createAnkiConnectClient } from "./ankiConnect/ankiConnectClient";
import { createAnkiTextFromClozePrompt } from "./ankiConnect/util/ankiTextEncoding";
import {
  AnkiClozeNote,
  AnkiNote,
  ankiNoteTag,
  AnkiQAPromptNote,
  clozeModelName,
  qaPromptModelName,
} from "./dataModel";
import {
  _computeAnkiOperationSet,
  _getPromptTaskRecordFromAnkiNoteCacheRecord,
  createAnkiCache,
} from "./index";
import {
  findAllPrompts,
  ClozePrompt,
  QAPrompt,
  processor,
} from "incremental-thinking";

beforeAll(() => {
  console.log("avoid mocking bug"); // https://github.com/tschaub/mock-fs/issues/234
});

const promptMarkdown = `Test {cloze} {bar}

Q. Question
A. Answer`;
const [clozePrompt, qaPrompt] = findAllPrompts(
  processor.runSync(processor.parse(promptMarkdown))
) as [ClozePrompt, QAPrompt];
const clozePromptID = getIDForPrompt(clozePrompt);
const qaPromptID = getIDForPrompt(qaPrompt);

describe("computeAnkiOperations", () => {
  const testNoteData: PromptTaskNoteData = {
    noteTitle: "title",
    externalNoteID: null,
    modificationTimestamp: 456,
  };

  const clozeBlockRecord = {
    type: "collection",
    value: {
      type: "clozeBlock",
      prompt: clozePrompt,
      noteData: testNoteData,
    },
    childIDs: new Set("0"),
  } as TaskCollectionRecord<PromptTaskCollection>;

  const cache = JSONInMemoryCache<AnkiNote, {}>({
    type: "collection",
    value: {},
    children: {},
  });

  test("accumulates insertions", () => {
    const ops = _computeAnkiOperationSet(
      [
        {
          type: "insert",
          path: ["test.md"],
          record: {
            type: "collection",
            value: {
              type: "note",
              externalNoteID: { type: "test", id: "abc", openURL: null },
              modificationTimestamp: 456,
              noteTitle: "Title",
            },
            childIDs: new Set(["ABC"]),
          },
        },
        {
          type: "insert",
          path: ["test.md", "ABC"],
          record: clozeBlockRecord,
        },
        {
          type: "insert",
          path: ["test.md", "DEF"],
          record: {
            type: "task",
            value: {
              type: "qaPrompt",
              prompt: qaPrompt,
              noteData: testNoteData,
            },
          },
        },
      ],
      cache
    );
    expect(ops.addPrompts).toHaveLength(2);
    expect(ops.addPrompts[0].prompt).toEqual(clozePrompt);
    expect(ops.addPrompts[0].path).toEqual(["test.md", "ABC"]);
    expect(ops.addPrompts[1].prompt).toEqual(qaPrompt);
    expect(ops.addPrompts[1].path).toEqual(["test.md", "DEF"]);
    expect(ops.deleteNoteSubtrees).toHaveLength(0);
  });

  test("accumulates deletions", () => {
    const ops = _computeAnkiOperationSet(
      [
        { type: "delete", path: ["test.md"] },
        { type: "delete", path: ["test2.md"] },
      ],
      cache
    );
    expect(ops.addPrompts).toHaveLength(0);
    expect(ops.deleteNoteSubtrees).toHaveLength(2);
    expect(ops.deleteNoteSubtrees).toContainEqual(["test.md"]);
    expect(ops.deleteNoteSubtrees).toContainEqual(["test2.md"]);
  });

  test("avoids spurious deletions", () => {
    const ops = _computeAnkiOperationSet(
      [
        { type: "delete", path: ["test.md", "ABC"] },
        { type: "delete", path: ["test.md"] },
      ],
      cache
    );
    expect(ops.addPrompts).toHaveLength(0);
    expect(ops.deleteNoteSubtrees).toHaveLength(1);
    expect(ops.deleteNoteSubtrees).toContainEqual(["test.md"]);
  });

  describe("moves", () => {
    test("move cloze block", () => {
      const newPath = ["a.md", "foo"];
      const oldPath = ["b.md", "foo"];
      const cache = JSONInMemoryCache<AnkiNote, PromptTaskCollection>({
        type: "collection",
        value: { type: "root" },
        children: {
          "a.md": {
            type: "collection",
            value: {
              type: "note",
              externalNoteID: null,
              noteTitle: "title",
              modificationTimestamp: 456,
            },
            children: {
              [clozePromptID]: {
                type: "task",
                value: {
                  noteId: 123,
                  modelName: clozeModelName,
                  tags: [ankiNoteTag],
                  fields: {
                    Text: createAnkiTextFromClozePrompt(clozePrompt),
                    NoteTitle: "title",
                    NoteURL: "url",
                    _Path: encodeTaskIDPath(["a.md", clozePromptID]),
                    _OriginalMarkdown: promptMarkdown,
                    _NoteDataJSON: JSON.stringify(testNoteData),
                  },
                } as AnkiClozeNote,
              },
            },
          },
        },
      });

      const ops = _computeAnkiOperationSet(
        [
          {
            type: "move",
            path: newPath,
            oldPath,
            record: clozeBlockRecord,
          },
        ],
        cache
      );
      expect(ops.movePrompts).toEqual([
        {
          prompt: clozePrompt,
          oldPath,
          path: newPath,
          noteData: {
            noteTitle: "title",
            externalNoteID: null,
            modificationTimestamp: 456,
          },
        },
      ]);
    });

    test("fails when moving cloze block ID", () => {
      const newPath = ["a.md", "foo"];
      const oldPath = ["a.md", "bar"];
      expect(() =>
        _computeAnkiOperationSet(
          [
            {
              type: "move",
              path: newPath,
              oldPath,
              record: clozeBlockRecord,
            },
          ],
          cache
        )
      ).toThrow();
    });

    test("fails when moving between levels", () => {
      const newPath = ["a.md"];
      const oldPath = ["a.md", "bar"];
      expect(() =>
        _computeAnkiOperationSet(
          [
            {
              type: "move",
              path: newPath,
              oldPath,
              record: clozeBlockRecord,
            },
          ],
          cache
        )
      ).toThrow();
    });

    test("fails when moving notes", () => {
      const newPath = ["a.md"];
      const oldPath = ["b.md"];
      expect(() =>
        _computeAnkiOperationSet(
          [
            {
              type: "move",
              path: newPath,
              oldPath,
              record: clozeBlockRecord,
            },
          ],
          cache
        )
      ).toThrow();
    });
  });
});

test("map anki notes onto prompt task records", async () => {
  const testNoteData = {
    noteTitle: "title",
    externalNoteID: { type: "test", id: "abc", openURL: null },
    modificationTimestamp: 456,
  };
  const cache = JSONInMemoryCache<AnkiNote, PromptTaskCollection>({
    type: "collection",
    value: { type: "root" },
    children: {
      a: {
        type: "collection",
        value: {
          type: "note",
          ...testNoteData,
        },
        children: {
          [clozePromptID]: {
            type: "task",
            value: {
              noteId: 123,
              modelName: clozeModelName,
              tags: [ankiNoteTag],
              fields: {
                Text: createAnkiTextFromClozePrompt(clozePrompt),
                NoteTitle: "title",
                NoteURL: "url",
                _Path: encodeTaskIDPath(["a", clozePromptID]),
                _OriginalMarkdown: "Test {cloze} {bar}",
                _NoteDataJSON: JSON.stringify(testNoteData),
              },
            } as AnkiClozeNote,
          },
          [qaPromptID]: {
            type: "task",
            value: {
              noteId: 789,
              modelName: qaPromptModelName,
              tags: [ankiNoteTag],
              fields: {
                Front: "Question",
                Back: "Answer",
                NoteTitle: testNoteData.noteTitle,
                NoteURL: "null",
                _Path: encodeTaskIDPath(["a", qaPromptID]),
                _NoteDataJSON: JSON.stringify(testNoteData),
                _PromptJSON: JSON.stringify(qaPrompt),
              },
            } as AnkiQAPromptNote,
          },
        },
      },
    },
  });

  await cache.performOperations(async (session) => {
    expect(
      _getPromptTaskRecordFromAnkiNoteCacheRecord(
        [],
        await getItemAtPath([], session),
        cache
      )
    ).toEqual({
      type: "collection",
      value: { type: "root" },
      childIDs: new Set(["a"]),
    });

    const noteData = {
      noteTitle: "title",
      modificationTimestamp: 456,
      externalNoteID: {
        id: "abc",
        openURL: null,
        type: "test",
      },
    };

    expect(
      _getPromptTaskRecordFromAnkiNoteCacheRecord(
        ["a"],
        await getItemAtPath(["a"], session),
        cache
      )
    ).toEqual({
      type: "collection",
      value: {
        type: "note",
        ...noteData,
      },
      childIDs: new Set([clozePromptID, qaPromptID]),
    });

    expect(
      _getPromptTaskRecordFromAnkiNoteCacheRecord(
        ["b"],
        await getItemAtPath(["b"], session),
        cache
      )
    ).toBeNull();

    const clozeLeafIDs = getClozeNoteTaskCollectionChildIDsForClozePrompt(
      clozePrompt
    );
    const clozeBlockRecord = _getPromptTaskRecordFromAnkiNoteCacheRecord(
      ["a", clozePromptID],
      await getItemAtPath(["a", clozePromptID], session),
      cache
    );
    expect(clozeBlockRecord).toMatchObject({
      type: "collection",
      value: { type: "clozeBlock", prompt: clozePrompt, noteData },
      childIDs: clozeLeafIDs,
    });

    expect(
      _getPromptTaskRecordFromAnkiNoteCacheRecord(
        ["a", "foobar"],
        await getItemAtPath(["a", "foobar"], session),
        cache
      )
    ).toBeNull();

    expect(clozeLeafIDs.size).toEqual(2);
    clozeLeafIDs.forEach(async (leafID) => {
      expect(
        _getPromptTaskRecordFromAnkiNoteCacheRecord(
          ["a", clozePromptID, leafID],
          await getItemAtPath(["a", clozePromptID, leafID], session),
          cache
        )
      ).toEqual({
        type: "task",
        value: { type: "cloze" },
      });
    });

    expect(
      _getPromptTaskRecordFromAnkiNoteCacheRecord(
        ["a", clozePromptID, "foobarbaz"],
        await getItemAtPath(["a", clozePromptID, "foobarbaz"], session),
        cache
      )
    ).toBeNull();

    const qaPromptRecord = _getPromptTaskRecordFromAnkiNoteCacheRecord(
      ["a", qaPromptID],
      await getItemAtPath(["a", qaPromptID], session),
      cache
    )!;
    expect(qaPromptRecord).toBeTruthy();
    if (qaPromptRecord.type !== "task") fail();
    if (qaPromptRecord.value.type !== "qaPrompt") fail();
    expect(qaPromptRecord.value.prompt).toMatchObject(qaPrompt);
    expect(qaPromptRecord.value.noteData).toMatchObject(testNoteData);
  });
});

test("anki cache integration", async () => {
  const noteSource = createTaskSource(["/a.md", "/b.md"]);
  mockFS({
    "/a.md": "Test",
    "/b.md": "Another {with} {cloze}",
  });

  const instance = axios.create();
  const mock = new MockAdapter(instance);
  mock.onPost("/").reply(200, JSON.stringify({ result: [], error: null }));

  const ankiCache = createAnkiCache(
    createAnkiConnectClient(instance, "Default"),
    false
  );

  await noteSource.performOperations(async (noteSession) => {
    await ankiCache.performOperations(async (ankiSession) => {
      const changes = await _computeCacheDelta(ankiSession, noteSession);
      expect(changes).toMatchSnapshot();
      const operationSet = _computeAnkiOperationSet(changes, null);
      expect(operationSet).toMatchSnapshot();
    });
  });
});

afterEach(() => mockFS.restore());
