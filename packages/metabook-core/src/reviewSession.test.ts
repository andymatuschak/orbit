import { PromptID } from "./promptID";
import { PromptState } from "./promptState/promptState";
import { getDuePromptTasks } from "./reviewSession";
import { clozePromptType, qaPromptType } from "./types/prompt";
import { getIDForPromptTask, PromptTaskID } from "./types/promptTask";

function createPromptState(isDue: boolean): PromptState {
  return {
    lastReviewTimestampMillis: 0,
    lastReviewTaskParameters: null,
    headActionLogIDs: [],
    needsRetry: false,
    bestIntervalMillis: null,
    intervalMillis: 0,
    taskMetadata: { isDeleted: false, provenance: null },
    dueTimestampMillis: Date.now() + 1000 * 60 * 60 * 24 * (isDue ? -1 : 1),
  };
}

function generateCardStates(count: number, dueCount: number) {
  const cardStates: Map<PromptTaskID, PromptState> = new Map();
  for (let i = 0; i < count; i++) {
    cardStates.set(
      getIDForPromptTask({
        promptID: i.toString() as PromptID,
        promptType: qaPromptType,
        promptParameters: null,
      }),
      createPromptState(i < dueCount),
    );
  }
  return cardStates;
}

describe("getDuePromptTasks", () => {
  describe("session cap", () => {
    test("due cards are capped", () => {
      expect(
        getDuePromptTasks({
          promptStates: generateCardStates(100, 100),
          thresholdTimestampMillis: Date.now(),
        }),
      ).toHaveLength(50);
    });

    test("only due cards are included", () => {
      expect(
        getDuePromptTasks({
          promptStates: generateCardStates(100, 10),
          thresholdTimestampMillis: Date.now(),
        }),
      ).toHaveLength(10);
    });
  });

  test("sibling cloze prompts removed", () => {
    const states = new Map<PromptTaskID, PromptState>([
      [
        getIDForPromptTask({
          promptID: "a" as PromptID,
          promptType: clozePromptType,
          promptParameters: { clozeIndex: 0 },
        }),
        createPromptState(true),
      ],
      [
        getIDForPromptTask({
          promptID: "b" as PromptID,
          promptType: clozePromptType,
          promptParameters: { clozeIndex: 0 },
        }),
        createPromptState(true),
      ],
      [
        getIDForPromptTask({
          promptID: "a" as PromptID,
          promptType: clozePromptType,
          promptParameters: { clozeIndex: 1 },
        }),
        createPromptState(true),
      ],
    ]);
    const inputTaskIDs = [...states.keys()];
    const dueTaskIDs = getDuePromptTasks({
      promptStates: states,
      thresholdTimestampMillis: Date.now(),
    });
    expect(dueTaskIDs).toMatchObject([inputTaskIDs[0], inputTaskIDs[1]]);
  });
});
