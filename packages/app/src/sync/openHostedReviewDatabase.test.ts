import type {
  AutomergeDocumentURL,
  ReviewItem,
  VaultID,
  VaultMutation,
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

  test("does not hold a durable review write behind its widget projection", async () => {
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
});

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
    getReviewQueue?: () => Promise<ReviewItem[]>;
    subscribe?: (listener: () => void) => () => void;
  },
): PerTaskRepository {
  return {
    vaultID: "native-vault" as VaultID,
    subscribe: overrides.subscribe ?? (() => () => undefined),
    getReviewQueue: overrides.getReviewQueue ?? (async () => []),
    apply: overrides.apply,
    close: overrides.close,
    async readAttachment() {
      return null;
    },
  } as unknown as PerTaskRepository;
}
