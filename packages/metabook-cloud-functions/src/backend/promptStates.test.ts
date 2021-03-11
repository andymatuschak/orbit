import { PromptStateCache } from "@withorbit/firebase-support";
import { _getActiveTaskCountDelta } from "./promptStates";

describe("_getActiveTaskCountDelta", () => {
  const basePromptStateCache = {
    taskMetadata: { isDeleted: false },
  } as PromptStateCache;
  const deletedPromptStateCache = {
    taskMetadata: { isDeleted: true },
  } as PromptStateCache;

  test("deleting a prompt", () => {
    expect(
      _getActiveTaskCountDelta(basePromptStateCache, deletedPromptStateCache),
    ).toBe(-1);
  });

  test("inserting a new task", () => {
    expect(_getActiveTaskCountDelta(null, basePromptStateCache)).toBe(1);
  });

  test("inserting a new deleted task", () => {
    expect(_getActiveTaskCountDelta(null, deletedPromptStateCache)).toBe(0);
  });

  test("updating an existing task", () => {
    expect(
      _getActiveTaskCountDelta(basePromptStateCache, {
        ...basePromptStateCache,
      }),
    ).toBe(0);
  });
});
