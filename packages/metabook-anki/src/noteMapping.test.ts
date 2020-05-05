import { basicPromptType, clozePromptType } from "metabook-core";
import withTestAnkiCollection from "./__fixtures__/withTestAnkiCollection";
import {
  AnkiCollectionDBHandle,
  Note,
  readNotes,
  splitAnkiDBNoteFields,
} from "./ankiPkg";
import {
  BasicModelMapping,
  ClozeModelMapping,
  ModelMappingType,
} from "./modelMapping";
import { mapNoteToPrompt } from "./noteMapping";

const notes: Note[] = [];
beforeAll(async () => {
  await withTestAnkiCollection(async (handle: AnkiCollectionDBHandle) => {
    await readNotes(handle, (note) => {
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
    mapNoteToPrompt(
      findNoteByFirstFieldContents("Test Q")!,
      basicMapping,
      jest.fn(),
    ),
  ).toMatchObject({
    issues: [],
    prompt: {
      promptType: basicPromptType,
      question: {
        contents: "Test Q",
        attachments: [],
      },
      answer: {
        contents: "Test A",
        attachments: [],
      },
    },
  });
});

test("mapping cloze note", () => {
  const result = mapNoteToPrompt(
    findNoteByFirstFieldContents("Test {{c1::cloze}} deletion {{c2::prompt}}")!,
    clozeMapping,
    jest.fn(),
  );
  expect(result.prompt).toMatchObject({
    promptType: clozePromptType,
    body: {
      contents: "Test {cloze} deletion {prompt}",
      attachments: [],
    },
  });
  expect(result.issues).toHaveLength(1);
});

test("mapping note with image", () => {
  const imageNote = notes.find((note) => note.flds.includes("<img"))!;
  const mock = jest.fn();
  mock.mockImplementation((ref) => `${ref.type}-${ref.name}`);
  const result = mapNoteToPrompt(imageNote, basicMapping, mock);
  expect(result).toMatchInlineSnapshot(`
    Object {
      "issues": Array [],
      "prompt": Object {
        "answer": Object {
          "attachments": Array [
            "image-paste-235d52a420e48250574495268d1eaadbcd40e188.jpg",
          ],
          "contents": "Test answer with an image",
        },
        "explanation": null,
        "promptType": "basic",
        "question": Object {
          "attachments": Array [
            "image-paste-5146b5478bc75de1c703057f0a51a93a70ca922d.jpg",
          ],
          "contents": "Test question with an image",
        },
      },
      "provenance": null,
    }
  `);
});
