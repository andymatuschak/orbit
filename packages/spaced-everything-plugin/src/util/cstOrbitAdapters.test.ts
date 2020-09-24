import { testClozePrompt } from "metabook-sample-data";
import { simpleOrbitPrompt } from "../__fixtures__/testData";
import {
  getITPromptForOrbitPrompt,
  getOrbitPromptForITPrompt,
} from "./cstOrbitAdapters";

describe("getITPromptForOrbitPrompt", () => {
  test("qa prompt", () => {
    expect(getITPromptForOrbitPrompt(simpleOrbitPrompt)).toBeTruthy();
  });

  test("cloze prompt", () => {
    expect(getITPromptForOrbitPrompt(testClozePrompt)).toBeTruthy();
  });
});

test("round trip", () => {
  expect(
    getOrbitPromptForITPrompt(getITPromptForOrbitPrompt(simpleOrbitPrompt)!),
  ).toMatchObject(simpleOrbitPrompt);

  expect(
    getOrbitPromptForITPrompt(getITPromptForOrbitPrompt(testClozePrompt)!),
  ).toMatchObject(testClozePrompt);
});
