import getDuePromptTaskIDs from "./getDuePromptTaskIDs";
import { PromptID } from "./promptID";
import { PromptState } from "./promptState/promptState";
import { basicPromptType } from "./types/prompt";
import { getIDForPromptTask, PromptTaskID } from "./types/promptTask";

function generateCardStates(count: number, dueCount: number) {
  const cardStates: Map<PromptTaskID, PromptState> = new Map();
  for (let i = 0; i < count; i++) {
    cardStates.set(
      getIDForPromptTask({
        promptID: i.toString() as PromptID,
        promptType: basicPromptType,
        promptParameters: null,
      }),
      {
        lastReviewTimestampMillis: 0,
        lastReviewTaskParameters: null,
        headActionLogIDs: [],
        needsRetry: false,
        bestIntervalMillis: null,
        intervalMillis: 0,
        taskMetadata: { isDeleted: false },
        dueTimestampMillis:
          Date.now() + 1000 * 60 * 60 * 24 * (i < dueCount ? -1 : 1),
        provenance: null,
      },
    );
  }
  return cardStates;
}

describe("session cap", () => {
  test("due cards are capped", () => {
    expect(
      getDuePromptTaskIDs({
        promptStates: generateCardStates(100, 100),
        timestampMillis: Date.now(),
        reviewSessionIndex: 0,
        cardsCompletedInCurrentSession: 0,
      }),
    ).toHaveLength(25);
  });

  test("cap builds on count already completed in current session", () => {
    expect(
      getDuePromptTaskIDs({
        promptStates: generateCardStates(100, 100),
        timestampMillis: Date.now(),
        reviewSessionIndex: 0,
        cardsCompletedInCurrentSession: 10,
      }),
    ).toHaveLength(15);
  });
});

test("only due cards are included", () => {
  expect(
    getDuePromptTaskIDs({
      promptStates: generateCardStates(100, 10),
      timestampMillis: Date.now(),
      reviewSessionIndex: 0,
      cardsCompletedInCurrentSession: 0,
    }),
  ).toHaveLength(10);
});
