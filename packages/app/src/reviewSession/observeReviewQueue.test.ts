import type { ReviewItem } from "@withorbit/core";
import { expect, spyOn, test } from "bun:test";
import {
  observeReviewQueue,
  type ReviewQueueState,
} from "./observeReviewQueue.js";

function fixture(synchronousQueue?: ReviewItem[]) {
  let resolve!: (queue: ReviewItem[]) => void;
  let reject!: (error: unknown) => void;
  const initial = new Promise<ReviewItem[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const states: ReviewQueueState[] = [];
  let push!: (queue: ReviewItem[]) => void;
  let detached = false;
  const close = observeReviewQueue(
    {
      fetchReviewQueue: () => initial,
      subscribeToReviewQueue(listener) {
        push = listener;
        if (synchronousQueue) listener(synchronousQueue);
        return () => {
          detached = true;
        };
      },
    },
    (state) => states.push(state),
  );
  return { states, push, resolve, reject, close, detached: () => detached };
}

test("a late initial-read failure cannot replace a usable pushed queue", async () => {
  const f = fixture();
  const queue = [{ task: { id: "pushed" } } as ReviewItem];
  f.push(queue);
  f.reject(new Error("old initial fetch failed"));
  await Promise.resolve();
  expect(f.states).toEqual([{ queue, error: null }]);
  f.close();
});

test("a late initial-read success cannot replace a newer pushed queue", async () => {
  const f = fixture();
  const queue = [{ task: { id: "pushed" } } as ReviewItem];
  f.push(queue);
  f.resolve([]);
  await Promise.resolve();
  expect(f.states).toEqual([{ queue, error: null }]);
  f.close();
});

test("a synchronous subscription queue also takes precedence over the initial read", async () => {
  const queue = [{ task: { id: "pushed synchronously" } } as ReviewItem];
  for (const fails of [false, true]) {
    const f = fixture(queue);
    if (fails) f.reject(new Error("initial read failed"));
    else f.resolve([]);
    await Promise.resolve();
    expect(f.states).toEqual([{ queue, error: null }]);
    f.close();
  }
});

test("an initial-read failure with no newer queue still reports unavailable", async () => {
  const f = fixture();
  const error = new Error("initial fetch failed");
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    f.reject(error);
    await Promise.resolve();
    expect(f.states).toEqual([{ queue: null, error }]);
    expect(log).toHaveBeenCalledWith("Could not load review queue", error);
  } finally {
    log.mockRestore();
    f.close();
  }
});

test("an initial read supplies the queue when no newer queue has been pushed", async () => {
  const f = fixture();
  f.resolve([]);
  await Promise.resolve();
  expect(f.states).toEqual([{ queue: [], error: null }]);
  f.close();
});

test("closing detaches and ignores late initial reads and queue pushes", async () => {
  for (const fails of [false, true]) {
    const f = fixture();
    f.close();
    f.push([]);
    if (fails) f.reject(new Error("closed initial read failed"));
    else f.resolve([]);
    await Promise.resolve();
    expect(f.detached()).toBe(true);
    expect(f.states).toEqual([]);
  }
});
