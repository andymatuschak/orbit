import withTestAnkiCollection from "./__fixtures__/withTestAnkiCollection";
import {
  AnkiCollectionDBHandle,
  Collection,
  Model,
  ModelType,
  readCollection,
} from "./ankiPkg";
import { getModelMapping, ModelMappingType } from "./modelMapping";
import * as SpacedEverything from "./spacedEverything";

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
    Object {
      "answerFieldIndex": 1,
      "questionFieldIndex": 0,
      "type": "basic",
    }
  `);
  expect(
    getModelMapping(collection, getModelByName("Basic (type in the answer)")),
  ).toMatchInlineSnapshot(`
    Object {
      "answerFieldIndex": 1,
      "questionFieldIndex": 0,
      "type": "basic",
    }
  `);
});

test("cloze model maps", () => {
  expect(getModelMapping(collection, getModelByName("Cloze")))
    .toMatchInlineSnapshot(`
    Object {
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

describe("spaced everything model mapping", () => {
  test("basic", () => {
    expect(
      getModelMapping(
        ({
          models: {
            "10": {
              name: SpacedEverything.qaPromptModelName,
              type: ModelType.Standard,
            } as Partial<Model>,
          },
        } as Partial<Collection>) as Collection,
        10,
      ),
    ).toEqual({ type: ModelMappingType.SpacedEverythingQA });
  });

  test("cloze", () => {
    expect(
      getModelMapping(
        ({
          models: {
            "10": {
              name: SpacedEverything.clozeModelName,
              type: ModelType.Cloze,
            } as Partial<Model>,
          },
        } as Partial<Collection>) as Collection,
        10,
      ),
    ).toEqual({ type: ModelMappingType.SpacedEverythingCloze });
  });
});
