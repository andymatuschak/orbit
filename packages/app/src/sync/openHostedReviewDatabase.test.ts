import type { HostedSyncCredential } from "@withorbit/api";
import type {
  AutomergeDocumentURL,
  ReviewItem,
  VaultID,
  VaultMutation,
} from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import type { AuthenticationClient } from "../authentication/index.js";
import {
  MemoryVaultRegistryStorage,
  VaultRegistryManager,
} from "../vault/vaultRegistry.js";
import { HostedVaultControlError } from "./HostedVaultClient.js";
import type { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { tryOpenHostedReviewDatabase } from "./openHostedReviewDatabase.js";

describe("native hosted review database", () => {
  test("keeps legacy accounts on the compatibility path", async () => {
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const database = await tryOpenHostedReviewDatabase(openInput(registry), {
      widgetProjectionBridge: null,
      controlClient: {
        async resolveHostedRoot() {
          throw new HostedVaultControlError(409, "legacy-account");
        },
        getSyncCredential,
      },
    });

    expect(database).toBeNull();
    expect((await registry.getRegistry()).hostedVaults).toEqual([]);
  });

  test("opens a bound root and records locally without a reminder control write", async () => {
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const root = "automerge:native-account-root" as AutomergeDocumentURL;
    const eventsSeen: unknown[][] = [];
    let closed = false;
    const hosted = fakeHostedVault(root, {
      apply: async (mutations) => {
        eventsSeen.push([...mutations]);
      },
      close: async () => {
        closed = true;
      },
    });

    const database = await tryOpenHostedReviewDatabase(openInput(registry), {
      widgetProjectionBridge: null,
      controlClient: {
        async resolveHostedRoot() {
          return resolvedRoot(root);
        },
        getSyncCredential,
      },
      runOpenBound: async () => hosted,
    });

    expect(await database!.fetchReviewQueue()).toEqual([]);
    await database!.apply([]);
    await database!.close();
    expect(eventsSeen).toEqual([[]]);
    expect(closed).toBe(true);
  });

  test("opens an identity-matched cached root without the control API", async () => {
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const root = "automerge:native-offline-root" as AutomergeDocumentURL;
    await registry.getOrCreateHostedAccountVault({
      authenticationUserID: "firebase-user",
      accountID: "hosted-account",
      serviceOrigin: "https://sync.example.test",
      rootDocumentURL: root,
    });
    let resolveCalled = false;
    let openedRoot = "";

    const database = await tryOpenHostedReviewDatabase(openInput(registry), {
      widgetProjectionBridge: null,
      controlClient: {
        async resolveHostedRoot() {
          resolveCalled = true;
          throw new Error("offline");
        },
        getSyncCredential,
      },
      runOpenBound: async ({ entry }) => {
        expect(entry.authenticationUserID).toBe("firebase-user");
        expect(entry.accountID).toBe("hosted-account");
        openedRoot = entry.rootDocumentURL;
        return fakeHostedVault(root, {
          apply: async () => undefined,
          close: async () => undefined,
        });
      },
    });

    expect(resolveCalled).toBe(false);
    expect(openedRoot).toBe(root);
    expect(await database!.fetchReviewQueue()).toEqual([]);
    await database!.close();
  });

  test("opens a cached native root before Firebase finishes restoring auth", async () => {
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const root = "automerge:optimistic-root" as AutomergeDocumentURL;
    await registry.getOrCreateHostedAccountVault({
      authenticationUserID: "firebase-user",
      accountID: "hosted-account",
      serviceOrigin: "https://sync.example.test",
      rootDocumentURL: root,
    });
    const input = openInput(registry);
    input.authenticationClient = {
      async getUserAuthState() {
        throw new Error("auth must not block a cached local root");
      },
    } as unknown as AuthenticationClient;
    const database = await tryOpenHostedReviewDatabase(
      { ...input, allowCachedBeforeAuth: true },
      {
        widgetProjectionBridge: null,
        controlClient: {
          async resolveHostedRoot() {
            throw new Error("control API must not block a cached local root");
          },
          getSyncCredential,
        },
        runOpenBound: async () =>
          fakeHostedVault(root, {
            apply: async () => undefined,
            close: async () => undefined,
          }),
      },
    );
    expect(await database!.fetchReviewQueue()).toEqual([]);
    await database!.close();
  });

  test("still requires Firebase identity when no matching cached root exists", async () => {
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const input = openInput(registry);
    input.authenticationClient = {
      async getUserAuthState() {
        return { userID: "another-user", emailAddress: "other@example.test" };
      },
    } as unknown as AuthenticationClient;
    expect(
      tryOpenHostedReviewDatabase(
        { ...input, allowCachedBeforeAuth: true },
        { widgetProjectionBridge: null },
      ),
    ).rejects.toThrow("Authenticated account changed");
  });

  test("publishes the exact queue without blocking the review UI", async () => {
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
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

    const database = await tryOpenHostedReviewDatabase(openInput(registry), {
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
      controlClient: {
        async resolveHostedRoot() {
          return resolvedRoot(root);
        },
        getSyncCredential,
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
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
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

    const database = await tryOpenHostedReviewDatabase(openInput(registry), {
      widgetProjectionBridge: null,
      controlClient: {
        async resolveHostedRoot() {
          return resolvedRoot(root);
        },
        getSyncCredential,
      },
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
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const root = "automerge:native-launch-cache-root" as AutomergeDocumentURL;
    const authoritative = {
      task: { id: "task-authoritative" },
      componentID: "main",
    } as ReviewItem;
    let queueReads = 0;
    const database = await tryOpenHostedReviewDatabase(openInput(registry), {
      widgetProjectionBridge: {
        async readPendingReviews() {
          return [];
        },
        async markReviewsImported() {},
        async replaceProjection() {},
      },
      controlClient: {
        async resolveHostedRoot() {
          return resolvedRoot(root);
        },
        getSyncCredential,
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
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const root = "automerge:native-widget-commit-root" as AutomergeDocumentURL;
    let widgetWriteStarted!: () => void;
    let finishWidgetWrite!: () => void;
    const widgetWriteDidStart = new Promise<void>((resolve) => {
      widgetWriteStarted = resolve;
    });
    const widgetWriteMayFinish = new Promise<void>((resolve) => {
      finishWidgetWrite = resolve;
    });

    const database = await tryOpenHostedReviewDatabase(openInput(registry), {
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
      controlClient: {
        async resolveHostedRoot() {
          return resolvedRoot(root);
        },
        getSyncCredential,
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

  test("opens the server-created root after provisioning settles", async () => {
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const root = "automerge:ServerCreatedRoot" as AutomergeDocumentURL;
    let resolveAttempts = 0;
    let opened = false;
    const database = await tryOpenHostedReviewDatabase(openInput(registry), {
      widgetProjectionBridge: null,
      controlClient: {
        async resolveHostedRoot() {
          if (++resolveAttempts === 1)
            throw new HostedVaultControlError(404, "account-not-provisioned");
          return resolvedRoot(root);
        },
        getSyncCredential,
      },
      sleep: async () => undefined,
      runOpenBound: async (input) => {
        opened = true;
        expect(input.entry.rootDocumentURL).toBe(root);
        await input.requestCredential();
        return fakeHostedVault(root, {
          apply: async () => undefined,
          close: async () => undefined,
        });
      },
    });
    expect(opened).toBe(true);
    expect(resolveAttempts).toBe(2);
    expect((await registry.getRegistry()).hostedVaults).toHaveLength(1);
    await database!.close();
  });
});

function openInput(registry: VaultRegistryManager) {
  return {
    accountID: "firebase-user",
    authenticationClient: {
      async getUserAuthState() {
        return { userID: "firebase-user", emailAddress: "reader@example.test" };
      },
      async getCurrentIDToken() {
        return "unused-token";
      },
    } as unknown as AuthenticationClient,
    registry,
    serviceOrigin: "https://sync.example.test",
  };
}

function resolvedRoot(rootDocumentURL: AutomergeDocumentURL) {
  return {
    accountID: "hosted-account",
    rootDocumentURL,
  };
}

function getSyncCredential(): Promise<HostedSyncCredential> {
  return Promise.resolve({
    kind: "firebaseIDToken",
    token: "firebase-token",
  });
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
