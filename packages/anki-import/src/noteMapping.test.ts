import { ClozeTaskContent, TaskContentType } from "@withorbit/core";
import withTestAnkiCollection from "./__fixtures__/withTestAnkiCollection.js";
import {
  AnkiCollectionDBHandle,
  Note,
  readNotes,
  splitAnkiDBNoteFields,
} from "./ankiPkg/index.js";
import {
  BasicModelMapping,
  ClozeModelMapping,
  ModelMappingType,
} from "./modelMapping.js";
import { mapNoteToTaskSpec } from "./noteMapping.js";

const notes: Note[] = [];
beforeAll(async () => {
  await withTestAnkiCollection(async (handle: AnkiCollectionDBHandle) => {
    await readNotes(handle, async (note) => {
      notes.push(note);
    });
  });
});

const basicMapping: BasicModelMapping = {
  type: ModelMappingType.Basic,
  questionFieldIndex: 0,
  answerFieldIndex: 1,
};

const clozeMapping: ClozeModelMapping = {
  type: ModelMappingType.Cloze,
  contentsFieldIndex: 0,
};

function findNoteByFirstFieldContents(contents: string): Note | null {
  return (
    notes.find((note) => splitAnkiDBNoteFields(note.flds)[0] === contents) ??
    null
  );
}

test("mapping basic note", () => {
  expect(
    mapNoteToTaskSpec(findNoteByFirstFieldContents("Test Q")!, basicMapping),
  ).toMatchObject({
    issues: [],
    spec: {
      content: {
        type: TaskContentType.QA,
        body: {
          text: "Test Q",
          attachments: [],
        },
        answer: {
          text: "Test A",
          attachments: [],
        },
      },
    },
  });
});

test("mapping cloze note", () => {
  const result = mapNoteToTaskSpec(
    findNoteByFirstFieldContents("Test {{c1::cloze}} deletion {{c2::prompt}}")!,
    clozeMapping,
  );
  expect(result.spec).toMatchObject({
    content: {
      type: TaskContentType.Cloze,
      body: {
        text: "Test cloze deletion prompt",
        attachments: [],
      },
    },
  });
  expect((result.spec.content as ClozeTaskContent).components)
    .toMatchInlineSnapshot(`
    {
      "0": {
        "order": 0,
        "ranges": [
          {
            "hint": null,
            "length": 5,
            "startIndex": 5,
          },
        ],
      },
      "1": {
        "order": 1,
        "ranges": [
          {
            "hint": null,
            "length": 6,
            "startIndex": 20,
          },
        ],
      },
    }
  `);
  expect(result.issues).toHaveLength(1);
});

test("mapping note with image", () => {
  const imageNote = notes.find((note) => note.flds.includes("<img"))!;
  const result = mapNoteToTaskSpec(imageNote, basicMapping);
  expect(result).toMatchInlineSnapshot(`
    {
      "issues": [],
      "spec": {
        "content": {
          "answer": {
            "attachments": [
              "pyN-ng4VX1K49oL1eATILg",
            ],
            "text": "Test answer with an image",
          },
          "body": {
            "attachments": [
              "O1FLbMewV1yCmV2vzCfVxg",
            ],
            "text": "Test question with an image",
          },
          "type": "qa",
        },
        "type": "memory",
      },
    }
  `);
});
