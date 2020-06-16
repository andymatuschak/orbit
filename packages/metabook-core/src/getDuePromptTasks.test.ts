import getDuePromptTasks from "./getDuePromptTasks";
import { PromptID } from "./promptID";
import { PromptState } from "./promptState/promptState";
import { basicPromptType } from "./types/prompt";
import { PromptTask } from "./types/promptTask";

function generateCardStates(count: number, dueCount: number) {
  const cardStates: Map<PromptTask, PromptState> = new Map();
  for (let i = 0; i < count; i++) {
    cardStates.set(
      {
        promptID: i.toString() as PromptID,
        promptType: basicPromptType,
        promptParameters: null,
      },
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

describe("session cap", () => {
  test("due cards are capped", () => {
    expect(
      getDuePromptTasks({
        promptStates: generateCardStates(100, 100),
        timestampMillis: Date.now(),
        reviewSessionIndex: 0,
        cardsCompletedInCurrentSession: 0,
      }),
    ).toHaveLength(25);
  });

  test("cap builds on count already completed in current session", () => {
    expect(
      getDuePromptTasks({
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
    getDuePromptTasks({
      promptStates: generateCardStates(100, 10),
      timestampMillis: Date.now(),
      reviewSessionIndex: 0,
      cardsCompletedInCurrentSession: 0,
    }),
  ).toHaveLength(10);
});
