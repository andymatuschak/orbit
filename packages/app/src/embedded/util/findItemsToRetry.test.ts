import { ReviewItem, Task } from "@withorbit/core";
import { EmbeddedScreenRecord } from "@withorbit/embedded-support";
import { findItemsToRetry } from "./findItemsToRetry.js";

// null here indicates the item hasn't yet been reviewed; false means it has and doesn't need retry
function makeItem(needsRetry: boolean | null): ReviewItem {
  return {
    task: {
      componentStates: {
        a:
          needsRetry === null
            ? {
                lastRepetitionTimestampMillis: null,
                intervalMillis: 0,
                dueTimestampMillis: 0,
                createdAtTimestampMillis: 0,
              }
            : needsRetry
            ? {
                lastRepetitionTimestampMillis: 10,
                intervalMillis: 0,
                dueTimestampMillis: 10,
                createdAtTimestampMillis: 0,
              }
            : {
                lastRepetitionTimestampMillis: 10,
                intervalMillis: 1000,
                dueTimestampMillis: 1010,
                createdAtTimestampMillis: 0,
              },
      },
    } as unknown as Task,
    componentID: "a",
  };
}

function makeScreenRecord(needsRetry: boolean | null): EmbeddedScreenRecord {
  return {
    reviewItems: [makeItem(needsRetry)],
    attachmentIDsToURLs: {},
  };
}

test("it doesn't include items without prompt states", () => {
  expect(
    findItemsToRetry([makeItem(null), makeItem(null)], {
      orderedScreenRecords: [makeScreenRecord(null), makeScreenRecord(null)],
      receiverIndex: 0,
    }),
  ).toMatchObject([]);
});

test("it doesn't include items which don't need retry", () => {
  expect(
    findItemsToRetry([makeItem(null), makeItem(false)], {
      orderedScreenRecords: [makeScreenRecord(null), makeScreenRecord(false)],
      receiverIndex: 0,
    }),
  ).toMatchObject([]);
});

test("it doesn't include items from its own screen", () => {
  expect(
    findItemsToRetry([makeItem(true), makeItem(false)], {
      orderedScreenRecords: [makeScreenRecord(true), makeScreenRecord(false)],
      receiverIndex: 0,
    }),
  ).toMatchObject([]);
});

describe("it includes items from valid screens", () => {
  const orderedScreenRecords = [
    makeScreenRecord(false),
    makeScreenRecord(true),
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
