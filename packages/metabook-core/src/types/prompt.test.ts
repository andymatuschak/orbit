import { testClozePrompt } from "../__tests__/sampleData";
import { getClozeDeletionCount } from "./prompt";

describe("cloze prompts", () => {
  test("deletion count", () => {
    expect(getClozeDeletionCount(testClozePrompt)).toBe(2);
  });
});
