import { PromptState } from "metabook-core";
import { ReviewItem } from "metabook-embedded-support";
import { findItemsToRetry } from "./findItemsToRetry";

function makeItem(needsRetry: boolean | null): ReviewItem {
  return {
    promptState: needsRetry === null ? null : ({ needsRetry } as PromptState),
  } as ReviewItem;
}

test("it doesn't include items without prompt states", () => {
  expect(
    findItemsToRetry([makeItem(null), makeItem(null)], {
      orderedScreenRecords: [
        { reviewItems: [makeItem(null)] },
        { reviewItems: [makeItem(null)] },
      ],
      receiverIndex: 0,
    }),
  ).toMatchObject([]);
});

test("it doesn't include items which don't need retry", () => {
  expect(
    findItemsToRetry([makeItem(null), makeItem(false)], {
      orderedScreenRecords: [
        { reviewItems: [makeItem(null)] },
        { reviewItems: [makeItem(false)] },
      ],
      receiverIndex: 0,
    }),
  ).toMatchObject([]);
});

test("it doesn't include items from its own screen", () => {
  expect(
    findItemsToRetry([makeItem(true), makeItem(false)], {
      orderedScreenRecords: [
        { reviewItems: [makeItem(true)] },
        { reviewItems: [makeItem(false)] },
      ],
      receiverIndex: 0,
    }),
  ).toMatchObject([]);
});

describe("it includes items from valid screens", () => {
  const orderedScreenRecords = [
    { reviewItems: [makeItem(false)] },
    { reviewItems: [makeItem(true)] },
  ];
  const sessionItems = [makeItem(false), makeItem(true)];

  test("including other screens", () => {
    const results = findItemsToRetry(sessionItems, {
      orderedScreenRecords,
      receiverIndex: 0,
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(sessionItems[1]);
  });

  test("including its own screen if it's the last one", () => {
    expect(
      findItemsToRetry(sessionItems, {
        orderedScreenRecords,
        receiverIndex: 1,
      }),
    ).toHaveLength(1);
  });
});
