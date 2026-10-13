import {
  TaskRepetitionOutcome,
  type ReviewItem,
  type VaultID,
} from "@withorbit/core";
import type { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { expect, test } from "bun:test";
import { openNativeHostedReviewDatabase } from "../sync/openHostedReviewDatabase.js";
import type {
  WidgetProjectionBridge,
  WidgetReviewOutboxRecord,
} from "./widgetProjection.js";

function lifecycle() {
  let listener = () => {};
  let removed = 0;
  return {
    subscribeToForeground(callback: () => void) {
      listener = callback;
      return () => {
        removed++;
      };
    },
    resume() {
      listener();
    },
    get removed() {
      return removed;
    },
  };
}

function outbox() {
  const pending: WidgetReviewOutboxRecord[] = [];
  const calls: string[] = [];
  const bridge: WidgetProjectionBridge = {
    async readPendingReviews() {
      calls.push("read");
      return pending.slice();
    },
    async replaceProjection() {},
    async markReviewsImported({ observationIDs, reviewItems }) {
      calls.push("ack");
      expect(reviewItems).toEqual([]);
      for (let index = pending.length - 1; index >= 0; index--) {
        if (observationIDs.includes(pending[index]!.observationID))
          pending.splice(index, 1);
      }
    },
  };
  return { pending, calls, bridge };
}

const record = (): WidgetReviewOutboxRecord => ({
  mutationID:
    "review/0000000000000000000000" as WidgetReviewOutboxRecord["mutationID"],
  observationID:
    "review/0000000000000000000000" as WidgetReviewOutboxRecord["observationID"],
  taskID: "task-a" as WidgetReviewOutboxRecord["taskID"],
  componentID: "main",
  outcome: TaskRepetitionOutcome.Remembered,
  occurredAtTimestampMillis: 10,
});

test("native foreground drains reviews, pushes the fresh queue, and unsubscribes on close", async () => {
  const events = lifecycle();
  const { pending, calls, bridge } = outbox();
  const hosted = {
    vaultID: "vault-test" as VaultID,
    subscribe: () => () => {},
    async apply() {
      calls.push("apply");
    },
    async getReviewQueue() {
      calls.push("queue");
      return [];
    },
    async close() {
      calls.push("close");
    },
  } as unknown as PerTaskRepository;
  const database = await openNativeHostedReviewDatabase(hosted, {
    widgetProjectionBridge: bridge,
    subscribeToForeground: events.subscribeToForeground,
  });
  const pushed = new Promise<ReviewItem[]>((resolve) =>
    database.subscribeToReviewQueue(resolve),
  );
  pending.push(record());
  events.resume();
  expect(await pushed).toEqual([]);
  expect(pending).toEqual([]);
  expect(calls).toEqual(["read", "read", "apply", "queue", "ack"]);
  await database.close();
  pending.push(record());
  events.resume();
  await Promise.resolve();
  await Promise.resolve();
  expect(calls.at(-1)).toBe("close");
  expect(events.removed).toBe(1);
});

test("native close finishes an in-flight import and skips later queued resumes", async () => {
  const events = lifecycle();
  const { pending, calls, bridge } = outbox();
  let release!: () => void;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const hosted = {
    vaultID: "vault-test" as VaultID,
    subscribe: () => () => {},
    async apply() {
      calls.push("apply");
      began();
      await blocked;
    },
    async getReviewQueue() {
      calls.push("queue");
      return [];
    },
    async close() {
      calls.push("close");
    },
  } as unknown as PerTaskRepository;
  const database = await openNativeHostedReviewDatabase(hosted, {
    widgetProjectionBridge: bridge,
    subscribeToForeground: events.subscribeToForeground,
  });
  pending.push(record());
  events.resume();
  await started;
  events.resume();
  const closing = database.close();
  release();
  await closing;
  expect(calls).toEqual(["read", "read", "apply", "queue", "ack", "close"]);
  expect(pending).toEqual([]);
});

test("native foreground does not notify or discard a review before its fresh queue is acknowledged", async () => {
  const events = lifecycle();
  const { pending, calls, bridge } = outbox();
  const acknowledge = bridge.markReviewsImported;
  let acknowledgementAttempts = 0;
  bridge.markReviewsImported = async (input) => {
    if (++acknowledgementAttempts === 1) throw new Error("handoff unavailable");
    await acknowledge(input);
  };
  const errors: unknown[] = [];
  let failed!: () => void;
  const failure = new Promise<void>((resolve) => {
    failed = resolve;
  });
  const appliedIDs: string[] = [];
  const hosted = {
    vaultID: "vault-test" as VaultID,
    subscribe: () => () => {},
    async apply(mutations: readonly { mutationID: string }[]) {
      appliedIDs.push(mutations[0]!.mutationID);
    },
    async getReviewQueue() {
      return [];
    },
    async close() {},
  } as unknown as PerTaskRepository;
  const database = await openNativeHostedReviewDatabase(hosted, {
    widgetProjectionBridge: bridge,
    subscribeToForeground: events.subscribeToForeground,
    onWidgetError(error) {
      errors.push(error);
      failed();
    },
  });
  const pushed: ReviewItem[][] = [];
  let notified!: () => void;
  const notification = new Promise<void>((resolve) => {
    notified = resolve;
  });
  database.subscribeToReviewQueue((queue) => {
    pushed.push(queue);
    notified();
  });
  pending.push(record());
  events.resume();
  await failure;
  expect(errors).toHaveLength(1);
  expect(pushed).toEqual([]);
  expect(pending).toHaveLength(1);
  events.resume();
  await notification;
  expect(pushed).toEqual([[]]);
  expect(pending).toEqual([]);
  expect(appliedIDs).toEqual([record().mutationID, record().mutationID]);
  expect(calls.filter((call) => call === "ack")).toHaveLength(1);
  await database.close();
});

test("a delayed widget acknowledgement cannot replace a newer Repo queue notification", async () => {
  const events = lifecycle();
  const { pending, bridge } = outbox();
  const acknowledge = bridge.markReviewsImported;
  let release!: () => void;
  let began!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  bridge.markReviewsImported = async (input) => {
    began();
    await blocked;
    await acknowledge(input);
  };
  let queue: ReviewItem[] = [];
  let change = () => {};
  const hosted = {
    vaultID: "vault-test" as VaultID,
    subscribe(listener: () => void) {
      change = listener;
      return () => {};
    },
    async apply() {},
    async getReviewQueue() {
      return queue;
    },
    async close() {},
  } as unknown as PerTaskRepository;
  const database = await openNativeHostedReviewDatabase(hosted, {
    widgetProjectionBridge: bridge,
    subscribeToForeground: events.subscribeToForeground,
    reviewQueueDebounceMillis: 0,
  });
  const pushed: ReviewItem[][] = [];
  let notify!: () => void;
  const changed = new Promise<void>((resolve) => {
    notify = resolve;
  });
  database.subscribeToReviewQueue((items) => {
    pushed.push(items);
    notify();
  });
  pending.push(record());
  events.resume();
  await started;
  const latest = [
    { task: { id: "newest" }, componentID: "main" } as ReviewItem,
  ];
  queue = latest;
  change();
  await changed;
  expect(pushed).toEqual([latest]);
  release();
  await new Promise<void>((resolve) => setTimeout(resolve, 5));
  expect(pending).toEqual([]);
  expect(pushed.every((items) => items === latest)).toBe(true);
  await database.close();
});
