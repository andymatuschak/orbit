import getDuePromptTaskIDs from "./getDuePromptTaskIDs";
import { PromptID } from "./promptID";
import { encodePromptTask, PromptTaskID } from "./types/promptTask";
import { PromptState } from "./types/promptState";

function generateCardStates(count: number, dueCount: number) {
  const cardStates: Map<PromptTaskID, PromptState> = new Map();
  for (let i = 0; i < count; i++) {
    cardStates.set(
      encodePromptTask({
        promptID: i.toString() as PromptID,
        promptParameters: null,
      }),
      {
        needsRetry: false,
        bestInterval: null,
        interval: 0,
        dueTimestampMillis:
          Date.now() + 1000 * 60 * 60 * 24 * (i < dueCount ? -1 : 1),
        taskParameters: null,
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
