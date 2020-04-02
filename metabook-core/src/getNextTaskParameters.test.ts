import {
  testApplicationPromptSpec,
  testBasicPromptSpec,
  testClozePromptGroupSpec,
} from "./__tests__/sampleData";
import getNextTaskParameters from "./getNextTaskParameters";

test("basic prompt task parameters", () => {
  expect(getNextTaskParameters(testBasicPromptSpec, null)).toBeNull();
});

test("application prompt task parameters", () => {
  expect(
    getNextTaskParameters(testApplicationPromptSpec, { variantIndex: 0 }),
  ).toMatchObject({ variantIndex: 1 });
  expect(
    getNextTaskParameters(testApplicationPromptSpec, { variantIndex: 1 }),
  ).toMatchObject({ variantIndex: 0 });
});

test("cloze prompt task parameters", () => {
  expect(getNextTaskParameters(testClozePromptGroupSpec, null)).toBeNull();
});
