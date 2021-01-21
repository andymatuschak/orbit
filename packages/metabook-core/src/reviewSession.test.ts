import { PromptID } from "./promptID";
import { PromptState } from "./promptState/promptState";
import { getDuePromptTasks } from "./reviewSession";
import { qaPromptType } from "./types/prompt";
import { getIDForPromptTask, PromptTaskID } from "./types/promptTask";

function generateCardStates(count: number, dueCount: number) {
  const cardStates: Map<PromptTaskID, PromptState> = new Map();
  for (let i = 0; i < count; i++) {
    cardStates.set(
      getIDForPromptTask({
        promptID: i.toString() as PromptID,
        promptType: qaPromptType,
        promptParameters: null,
      }),
      {
        lastReviewTimestampMillis: 0,
        lastReviewTaskParameters: null,
        headActionLogIDs: [],
        needsRetry: false,
        bestIntervalMillis: null,
        intervalMillis: 0,
        taskMetadata: { isDeleted: false, provenance: null },
        dueTimestampMillis:
          Date.now() + 1000 * 60 * 60 * 24 * (i < dueCount ? -1 : 1),
      },
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
      ).toHaveLength(25);
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
});
