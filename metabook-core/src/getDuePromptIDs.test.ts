import getDuePromptIDs from "./getDuePromptIDs";
import { PromptSpecID } from "./promptSpecID";
import { encodePrompt, PromptID } from "./types/prompt";
import { PromptState } from "./types/promptState";

function generateCardStates(count: number, dueCount: number) {
  const cardStates: Map<PromptID, PromptState> = new Map();
  for (let i = 0; i < count; i++) {
    cardStates.set(
      encodePrompt({
        promptSpecID: i.toString() as PromptSpecID,
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
      getDuePromptIDs({
        promptStates: generateCardStates(100, 100),
        timestampMillis: Date.now(),
        reviewSessionIndex: 0,
        cardsCompletedInCurrentSession: 0,
      }),
    ).toHaveLength(25);
  });

  test("cap builds on count already completed in current session", () => {
    expect(
      getDuePromptIDs({
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
    getDuePromptIDs({
      promptStates: generateCardStates(100, 10),
      timestampMillis: Date.now(),
      reviewSessionIndex: 0,
      cardsCompletedInCurrentSession: 0,
    }),
  ).toHaveLength(10);
});
