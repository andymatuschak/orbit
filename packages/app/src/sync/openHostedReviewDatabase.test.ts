import {
  defaultOrbitSchedulerPolicy,
  type AutomergeDocumentURL,
  type ReviewItem,
  type TaskID,
  type VaultID,
  type VaultMutation,
  type VaultMutationID,
} from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import type { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import type { LabConnection } from "../vault/labConnection.js";
import { openLabReviewDatabase } from "./openHostedReviewDatabase.js";

describe("native Lab review database", () => {
  test("publishes the exact queue without blocking the review UI", async () => {
    const root = "automerge:native-widget-root" as AutomergeDocumentURL;
    const reviewItem = {
      task: { id: "task-a" },
      componentID: "main",
    } as ReviewItem;
    const published: (readonly ReviewItem[])[] = [];
    let finishNativeWrite!: () => void;
    const nativeWrite = new Promise<void>((resolve) => {
      finishNativeWrite = resolve;
    });

    const database = await openLabReviewDatabase(labConnection(root), {
      widgetProjectionBridge: {
        async readPendingReviews() {
          return [];
        },
        async markReviewsImported() {},
        async replaceProjection({ reviewItems }) {
          published.push(reviewItems);
          await nativeWrite;
        },
      },
      runOpenBound: async () =>
        fakeHostedVault(root, {
          apply: async () => undefined,
          close: async () => undefined,
          getReviewQueue: async () => [reviewItem],
        }),
    });

    const fetched = await Promise.race([
      database!.fetchReviewQueue(),
      new Promise<"timed out">((resolve) =>
        setTimeout(() => resolve("timed out"), 50),
      ),
    ]);
    expect(fetched).toEqual([reviewItem]);
    finishNativeWrite();
    await database!.close();
    expect(published.at(-1)).toEqual([reviewItem]);
  });

  test("opens from one local queue read and publishes later Repo merges", async () => {
    const root = "automerge:native-live-queue-root" as AutomergeDocumentURL;
    const first = {
      task: { id: "task-first" },
      componentID: "main",
    } as ReviewItem;
    const second = {
      task: { id: "task-second" },
      componentID: "main",
    } as ReviewItem;
    let queue = [first];
    let queueReads = 0;
    let emitVaultChange: () => void = () => undefined;
    const hosted = fakeHostedVault(root, {
      apply: async () => undefined,
      close: async () => undefined,
      getReviewQueue: async () => {
        queueReads++;
        return queue;
      },
      subscribe: (listener) => {
        emitVaultChange = listener;
        return () => undefined;
      },
    });

    const database = await openLabReviewDatabase(labConnection(root), {
      widgetProjectionBridge: null,
      runOpenBound: async () => hosted,
      reviewQueueDebounceMillis: 0,
    });

    expect(queueReads).toBe(0);
    const pushed = new Promise<ReviewItem[]>((resolve) =>
      database!.subscribeToReviewQueue(resolve),
    );
    expect(await database!.fetchReviewQueue()).toEqual([first]);
    expect(queueReads).toBe(1);

    queue = [second];
    emitVaultChange();
    expect(await pushed).toEqual([second]);
    expect(queueReads).toBe(2);
    await database!.close();
  });

  test("does not use the disposable widget projection as launch authority", async () => {
    const root = "automerge:native-launch-cache-root" as AutomergeDocumentURL;
    const authoritative = {
      task: { id: "task-authoritative" },
      componentID: "main",
    } as ReviewItem;
    let queueReads = 0;
    const database = await openLabReviewDatabase(labConnection(root), {
      widgetProjectionBridge: {
        async readPendingReviews() {
          return [];
        },
        async markReviewsImported() {},
        async replaceProjection() {},
      },
      runOpenBound: async () =>
        fakeHostedVault(root, {
          apply: async () => undefined,
          close: async () => undefined,
          getReviewQueue: async () => {
            queueReads++;
            return [authoritative];
          },
        }),
      reviewQueueDebounceMillis: 0,
    });

    expect(await database!.fetchReviewQueue()).toEqual([authoritative]);
    expect(queueReads).toBe(1);
    await database!.close();
  });

  test("an empty mutation batch does not wait for an unrelated widget projection", async () => {
    const root = "automerge:native-widget-commit-root" as AutomergeDocumentURL;
    let widgetWriteStarted!: () => void;
    let finishWidgetWrite!: () => void;
    const widgetWriteDidStart = new Promise<void>((resolve) => {
      widgetWriteStarted = resolve;
    });
    const widgetWriteMayFinish = new Promise<void>((resolve) => {
      finishWidgetWrite = resolve;
    });

    const database = await openLabReviewDatabase(labConnection(root), {
      widgetProjectionBridge: {
        async readPendingReviews() {
          return [];
        },
        async markReviewsImported() {},
        async replaceProjection() {
          widgetWriteStarted();
          await widgetWriteMayFinish;
        },
      },
      runOpenBound: async () =>
        fakeHostedVault(root, {
          apply: async () => undefined,
          close: async () => undefined,
        }),
    });

    await database!.fetchReviewQueue();
    await widgetWriteDidStart;
    let applyFinished = false;
    const applying = database!.apply([]).then(() => {
      applyFinished = true;
    });
    await applying;
    expect(applyFinished).toBe(true);
    finishWidgetWrite();
    await database!.close();
  });

  test("finishes the local widget handoff before a saved review can advance", async () => {
    const root = "automerge:native-widget-advance-root" as AutomergeDocumentURL;
    const next = { task: { id: "next" }, componentID: "main" } as ReviewItem;
    const calls: string[] = [];
    let emit = () => {};
    const notified: ReviewItem[][] = [];
    let started!: () => void;
    const writing = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: () => void;
    const written = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const database = await openLabReviewDatabase(labConnection(root), {
      reviewQueueDebounceMillis: 0,
      widgetProjectionBridge: {
        async readPendingReviews() {
          return [];
        },
        async markReviewsImported() {},
        async replaceProjection({ reviewItems }) {
          expect(reviewItems).toEqual([next]);
          calls.push("publishing");
          started();
          await written;
          calls.push("published");
        },
      },
      runOpenBound: async () =>
        fakeHostedVault(root, {
          async apply() {
            calls.push("saved");
            emit();
          },
          async getReviewQueue() {
            return [next];
          },
          subscribe(listener) {
            emit = listener;
            return () => {};
          },
          async close() {},
        }),
    });
    database.subscribeToReviewQueue((items) => notified.push(items));
    let advanced = false;
    const applying = database.apply([localMutation]).then(() => {
      advanced = true;
      calls.push("advance");
    });
    await writing;
    // A pushed queue can advance the UI independently of apply's promise.
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    expect(advanced).toBe(false);
    expect(notified).toEqual([]);
    finish();
    await applying;
    expect(calls[0]).toBe("saved");
    expect(calls.at(-1)).toBe("advance");
    expect(calls.lastIndexOf("published")).toBe(
      calls.lastIndexOf("publishing") + 1,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    expect(notified).toEqual([[next]]);
    await database.close();
  });

  test("the last cached review publishes locally without waiting for missing tasks", async () => {
    const root = "automerge:native-offline-tail-root" as AutomergeDocumentURL;
    const published: (readonly ReviewItem[])[] = [];
    const reads: boolean[] = [];
    const database = await openLabReviewDatabase(labConnection(root), {
      widgetProjectionBridge: {
        async readPendingReviews() {
          return [];
        },
        async markReviewsImported() {},
        async replaceProjection({ reviewItems }) {
          published.push(reviewItems);
        },
      },
      runOpenBound: async () =>
        fakeHostedVault(root, {
          async apply() {},
          async getReviewQueue(_now, _max, options) {
            reads.push(!!options?.localOnly);
            if (!options?.localOnly) throw new Error("uncached task offline");
            return [];
          },
          async close() {},
        }),
    });
    await database.apply([localMutation]);
    expect(reads).toEqual([true]);
    expect(published).toEqual([[]]);
    // The widget-only read must not masquerade as a complete app queue.
    await expect(database.fetchReviewQueue()).rejects.toThrow(
      "uncached task offline",
    );
    expect(reads).toEqual([true, false]);
    await database.close();
  });

  test.each(["queue read", "widget write"])(
    "a failed %s after saving does not reject or replay the review",
    async (failure) => {
      const root =
        "automerge:native-widget-failure-root" as AutomergeDocumentURL;
      const errors: unknown[] = [];
      let writes = 0;
      const database = await openLabReviewDatabase(labConnection(root), {
        onWidgetError: (error) => errors.push(error),
        widgetProjectionBridge: {
          async readPendingReviews() {
            return [];
          },
          async markReviewsImported() {},
          async replaceProjection() {
            throw new Error("widget write");
          },
        },
        runOpenBound: async () =>
          fakeHostedVault(root, {
            async apply() {
              writes++;
            },
            async getReviewQueue() {
              if (failure === "queue read") throw new Error(failure);
              return [];
            },
            async close() {},
          }),
      });
      await database.apply([localMutation]);
      expect(writes).toBe(1);
      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe(failure);
      await database.close();
    },
  );
});

const localMutation: VaultMutation = {
  kind: "setTaskDeleted",
  mutationID: "task-delete/local-test" as VaultMutationID,
  taskID: "reviewed" as TaskID,
  isDeleted: true,
};

function labConnection(rootDocumentURL: AutomergeDocumentURL): LabConnection {
  return {
    serviceOrigin: "https://sync.example.test",
    token: "paired-token",
    rootDocumentURL,
    localStoreID: "lab-test",
  };
}

function fakeHostedVault(
  root: AutomergeDocumentURL,
  overrides: {
    apply: (mutations: readonly VaultMutation[]) => Promise<void>;
    close: () => Promise<void>;
    getReviewQueue?: PerTaskRepository["getReviewQueue"];
    subscribe?: (listener: () => void) => () => void;
  },
): PerTaskRepository {
  return {
    vaultID: "native-vault" as VaultID,
    scheduler: defaultOrbitSchedulerPolicy,
    getTaskProjections: async () => ({ tasks: new Map() }),
    subscribe: overrides.subscribe ?? (() => () => undefined),
    getReviewQueue: overrides.getReviewQueue ?? (async () => []),
    apply: overrides.apply,
    close: overrides.close,
    async readAttachment() {
      return null;
    },
  } as unknown as PerTaskRepository;
}
