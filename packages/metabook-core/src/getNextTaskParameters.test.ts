import {
  testApplicationPrompt,
  testQAPrompt,
  testClozePrompt,
} from "./__tests__/sampleData";
import getNextTaskParameters from "./getNextTaskParameters";

test("basic prompt task parameters", () => {
  expect(getNextTaskParameters(testQAPrompt, null)).toBeNull();
});

test("application prompt task parameters", () => {
  expect(
    getNextTaskParameters(testApplicationPrompt, { variantIndex: 0 }),
  ).toMatchObject({ variantIndex: 1 });
  expect(
    getNextTaskParameters(testApplicationPrompt, { variantIndex: 1 }),
  ).toMatchObject({ variantIndex: 0 });
});

test("cloze prompt task parameters", () => {
  expect(getNextTaskParameters(testClozePrompt, null)).toBeNull();
});
