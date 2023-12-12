import withTestAnkiCollection from "./__fixtures__/withTestAnkiCollection.js";
import {
  AnkiCollectionDBHandle,
  Collection,
  readCollection,
} from "./ankiPkg/index.js";
import { getModelMapping } from "./modelMapping.js";

let collection: Collection;
beforeAll(async () => {
  await withTestAnkiCollection(async (handle: AnkiCollectionDBHandle) => {
    collection = await readCollection(handle);
  });
});

function getModelByName(modelName: string): number {
  return Number.parseInt(
    Object.keys(collection.models).find(
      (modelID) => collection.models[modelID].name === modelName,
    )!,
  );
}

test("basic model maps", () => {
  expect(getModelMapping(collection, getModelByName("Basic")))
    .toMatchInlineSnapshot(`
    {
      "answerFieldIndex": 1,
      "questionFieldIndex": 0,
      "type": "basic",
    }
  `);
  expect(
    getModelMapping(collection, getModelByName("Basic (type in the answer)")),
  ).toMatchInlineSnapshot(`
    {
      "answerFieldIndex": 1,
      "questionFieldIndex": 0,
      "type": "basic",
    }
  `);
});

test("cloze model maps", () => {
  expect(getModelMapping(collection, getModelByName("Cloze")))
    .toMatchInlineSnapshot(`
    {
      "contentsFieldIndex": 0,
      "type": "cloze",
    }
  `);
});

test("basic with reverse doesn't map", () => {
  expect(
    getModelMapping(collection, getModelByName("Basic (and reversed card)")),
  ).toBe("unknown");
});

test("missing model doesn't map", () => {
  expect(getModelMapping(collection, 2295802)).toBe("missing");
});

test("fancy IR3 model doesn't map", () => {
  expect(getModelMapping(collection, getModelByName("IR3"))).toBe("unknown");
});
