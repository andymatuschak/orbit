import type { HostedSyncCredential } from "@withorbit/api";
import type { AutomergeDocumentURL } from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import { NativePerTaskDocuments } from "../vault/nativePerTaskDocuments.js";
import type {
  NativeRepoDocumentChangedEvent,
  NativeRepoSyncStateChangedEvent,
  OrbitAutomergeNativeModule,
} from "../vault/orbitAutomergeNative.js";
import { NativeHostedSyncTransport } from "./NativeHostedSyncTransport.js";

describe("native hosted Repo lifecycle", () => {
  test("an offline missing-tail request remains tracked for the next connection", async () => {
    const native = new FakeNativeRepo();
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    let online = false;
    const missing = "automerge:UncachedQueueTail" as AutomergeDocumentURL;
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: async () => {
        if (!online) throw new Error("offline");
        // Tracking a remote-only request must not prime/find it before admission.
        expect(native.ensureCalls).toEqual([]);
        return credential("firebase");
      },
      localStoreID: "local-a",
      retryIntervalMillis: 10_000,
    });
    try {
      await expect(transport.ensureDocument(missing)).rejects.toThrow(
        "offline",
      );
      expect(native.ensureCalls).toEqual([]);
      online = true;
      await transport.connect();
      await eventually(() => native.ensureCalls.length > 0);
      expect(native.ensureCalls).toEqual([["local-a", missing]]);
    } finally {
      await transport.close();
      await documents.close();
    }
  });

  test("opens a local document without waiting for auth or a peer", async () => {
    const native = new FakeNativeRepo();
    const local = "automerge:LocalTask" as AutomergeDocumentURL;
    native.localDocuments.add(local);
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    let credentialRequests = 0;
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: async () => {
        credentialRequests++;
        throw new Error("offline");
      },
      localStoreID: "local-a",
    });
    expect(await transport.ensureDocument(local)).toBe(true);
    expect(credentialRequests).toBe(0);
    expect(native.connectCalls).toEqual([]);
    await transport.close();
    await documents.close();
  });

  test("does not prime a tracked remote-only document before admission", async () => {
    const native = new FakeNativeRepo();
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    const missing = "automerge:MissingTrackedTask" as AutomergeDocumentURL;
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: async () => {
        expect(native.ensureCalls).toEqual([]);
        return credential("firebase");
      },
      localStoreID: "local-a",
    });
    transport.documentChanged(missing);
    await transport.connect();
    await eventually(() => native.ensureCalls.length === 1);
    expect(native.ensureCalls).toEqual([["local-a", missing]]);
    await transport.close();
    await documents.close();
  });

  test("waits for a peer before a remote-only catalog repair fetch", async () => {
    const native = new FakeNativeRepo();
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    let releaseCredential!: (credential: HostedSyncCredential) => void;
    let credentialRequested = false;
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: () => {
        credentialRequested = true;
        return new Promise((resolve) => {
          releaseCredential = resolve;
        });
      },
      localStoreID: "local-a",
    });
    const missing = "automerge:RepairTask" as AutomergeDocumentURL;
    // Opening a conflicted local catalog starts repair before bootstrap has
    // connected. Repo Swift must not see find(missing) with no peer: it leaves
    // a requesting handle that later times out and remains unavailable.
    const fetch = transport.ensureDocument(missing);
    try {
      await eventually(() => credentialRequested);
      expect(native.ensureCalls).toEqual([]);
    } finally {
      releaseCredential?.(credential("firebase"));
      await fetch;
      await transport.close();
      await documents.close();
    }
    expect(native.connectCalls).toHaveLength(1);
    expect(native.ensureCalls).toEqual([["local-a", missing]]);
  });

  test("connects Repo Swift, fetches through Repo, and refreshes Firebase auth", async () => {
    const native = new FakeNativeRepo();
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    let credentialRequests = 0;
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: async () => {
        credentialRequests++;
        return credential(`firebase-${credentialRequests}`);
      },
      localStoreID: "local-a",
      retryIntervalMillis: 1,
    });

    await transport.connect();
    expect(transport.isReady()).toBe(true);
    expect(native.connectCalls[0]).toEqual([
      "local-a",
      "wss://sync.example.test/v1/sync",
      "firebase-1",
    ]);

    const root = "automerge:NativeRoot" as AutomergeDocumentURL;
    expect(await transport.ensureDocument(root)).toBe(true);
    expect(native.ensureCalls).toEqual([["local-a", root]]);

    native.emitSyncState({ localStoreID: "local-a", state: "disconnected" });
    await eventually(() => native.connectCalls.length === 2);
    expect(credentialRequests).toBe(2);
    expect(native.connectCalls[1]?.[2]).toBe("firebase-2");

    await transport.close();
    expect(native.disconnectCalls).toEqual(["local-a"]);
    await documents.close();
  });

  test("the document adapter observes its own Repo independently of auth transport", async () => {
    const native = new FakeNativeRepo();
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: async () => credential("firebase"),
      localStoreID: "local-a",
    });
    const root = "automerge:NativeRoot" as AutomergeDocumentURL;
    const changes: AutomergeDocumentURL[] = [];
    const unsubscribe = documents.subscribe((documentURL) =>
      changes.push(documentURL),
    );
    native.emitDocumentChange({
      localStoreID: "another-store",
      documentURL: root,
    });
    native.emitDocumentChange({
      localStoreID: "local-a",
      documentURL: "not-an-automerge-url",
    });
    native.emitDocumentChange({ localStoreID: "local-a", documentURL: root });
    expect(changes).toEqual([root]);

    await transport.close();
    native.emitDocumentChange({ localStoreID: "local-a", documentURL: root });
    expect(changes).toEqual([root, root]);
    unsubscribe();
    native.emitDocumentChange({ localStoreID: "local-a", documentURL: root });
    expect(changes).toEqual([root, root]);
    await documents.close();
  });

  test("coalesces simultaneous connection attempts before auth resolves", async () => {
    const native = new FakeNativeRepo();
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    let releaseCredential!: (credential: HostedSyncCredential) => void;
    let credentialRequests = 0;
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: () => {
        credentialRequests++;
        return new Promise((resolve) => {
          releaseCredential = resolve;
        });
      },
      localStoreID: "local-a",
    });

    const first = transport.connect();
    const second = transport.connect();
    expect(first).toBe(second);
    await eventually(() => credentialRequests === 1);
    expect(credentialRequests).toBe(1);
    releaseCredential(credential("firebase"));
    await first;
    expect(native.connectCalls).toHaveLength(1);

    await transport.close();
    await documents.close();
  });

  test("keeps retrying when credential refresh temporarily fails", async () => {
    const native = new FakeNativeRepo();
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    let credentialRequests = 0;
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: async () => {
        credentialRequests++;
        if (credentialRequests === 2) throw new Error("temporarily offline");
        return credential(`firebase-${credentialRequests}`);
      },
      localStoreID: "local-a",
      retryIntervalMillis: 1,
    });

    await transport.connect();
    native.emitSyncState({ localStoreID: "local-a", state: "disconnected" });
    await eventually(() => native.connectCalls.length === 2);
    expect(credentialRequests).toBe(3);
    expect(native.connectCalls[1]?.[2]).toBe("firebase-3");

    await transport.close();
    await documents.close();
  });

  test("keeps retrying when the initial credential request is offline", async () => {
    const native = new FakeNativeRepo();
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    let credentialRequests = 0;
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: async () => {
        credentialRequests++;
        if (credentialRequests === 1) throw new Error("offline");
        return credential("firebase-2");
      },
      localStoreID: "local-a",
      retryIntervalMillis: 1,
    });

    await expect(transport.connect()).rejects.toThrow("offline");
    await eventually(() => native.connectCalls.length === 1);
    expect(credentialRequests).toBe(2);
    expect(native.connectCalls[0]?.[2]).toBe("firebase-2");

    await transport.close();
    await documents.close();
  });

  test("reports an unavailable Repo document without matching error text", async () => {
    const native = new FakeNativeRepo();
    native.ensureResult = false;
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: async () => credential("firebase"),
      localStoreID: "local-a",
    });
    const missing = "automerge:Missing" as AutomergeDocumentURL;

    expect(await transport.ensureDocument(missing)).toBe(false);
    expect(native.ensureCalls).toEqual([["local-a", missing]]);

    await transport.close();
    await documents.close();
  });

  test("starts a document working set concurrently", async () => {
    const native = new FakeNativeRepo();
    let releaseEnsures!: () => void;
    native.ensureBarrier = new Promise<void>((resolve) => {
      releaseEnsures = resolve;
    });
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: async () => credential("firebase"),
      localStoreID: "local-a",
    });
    const documentURLs = [
      "automerge:First" as AutomergeDocumentURL,
      "automerge:Second" as AutomergeDocumentURL,
      "automerge:Third" as AutomergeDocumentURL,
    ];

    const operation = transport.ensureDocuments(documentURLs);
    await eventually(() => native.ensureCalls.length === documentURLs.length);
    expect(native.ensureCalls).toEqual(
      documentURLs.map((documentURL) => ["local-a", documentURL]),
    );
    releaseEnsures();
    expect(await operation).toEqual([true, true, true]);

    await transport.close();
    await documents.close();
  });

  test("rejoins locally materialized documents after connect and reconnect", async () => {
    const native = new FakeNativeRepo();
    const documents = new NativePerTaskDocuments(
      "local-a",
      native as unknown as OrbitAutomergeNativeModule,
    );
    const transport = new NativeHostedSyncTransport(documents, {
      websocketURL: "wss://sync.example.test/v1/sync",
      requestCredential: async () => credential("firebase"),
      localStoreID: "local-a",
      retryIntervalMillis: 1,
    });
    const locallyMaterialized = [
      "automerge:Root" as AutomergeDocumentURL,
      "automerge:Catalog" as AutomergeDocumentURL,
      "automerge:FirstTask" as AutomergeDocumentURL,
    ];
    for (const documentURL of locallyMaterialized) {
      native.localDocuments.add(documentURL);
      transport.documentChanged(documentURL);
    }

    await transport.connect();
    expect(native.ensureCalls.slice(0, locallyMaterialized.length)).toEqual(
      locallyMaterialized.map((documentURL) => ["local-a", documentURL]),
    );
    await eventually(() =>
      locallyMaterialized.every((documentURL) =>
        native.ensureCalls.some(
          (call) => call[0] === "local-a" && call[1] === documentURL,
        ),
      ),
    );

    native.ensureCalls.length = 0;
    native.emitSyncState({ localStoreID: "local-a", state: "disconnected" });
    await eventually(() => native.connectCalls.length === 2);
    await eventually(() =>
      locallyMaterialized.every((documentURL) =>
        native.ensureCalls.some(
          (call) => call[0] === "local-a" && call[1] === documentURL,
        ),
      ),
    );

    await transport.close();
    await documents.close();
  });
});

function credential(token: string): HostedSyncCredential {
  return {
    kind: "firebaseIDToken",
    token,
  };
}

class FakeNativeRepo {
  readonly connectCalls: unknown[][] = [];
  readonly ensureCalls: unknown[][] = [];
  readonly disconnectCalls: string[] = [];
  ensureResult = true;
  ensureBarrier: Promise<void> = Promise.resolve();
  readonly localDocuments = new Set<string>();
  private readonly documentListeners = new Set<
    (event: NativeRepoDocumentChangedEvent) => void
  >();
  private readonly syncListeners = new Set<
    (event: NativeRepoSyncStateChangedEvent) => void
  >();

  addListener(
    eventName: string,
    listener:
      | ((event: NativeRepoDocumentChangedEvent) => void)
      | ((event: NativeRepoSyncStateChangedEvent) => void),
  ) {
    const listeners =
      eventName === "onRepoDocumentChanged"
        ? this.documentListeners
        : this.syncListeners;
    listeners.add(listener as never);
    return { remove: () => listeners.delete(listener as never) };
  }

  async connectRepo(...input: unknown[]) {
    this.connectCalls.push(input);
    this.emitSyncState({
      localStoreID: String(input[0]),
      state: "ready",
    });
  }

  async ensureRepoDocument(...input: unknown[]) {
    this.ensureCalls.push(input);
    await this.ensureBarrier;
    return this.ensureResult;
  }

  async repoDocumentsExist(_storeID: string, documentURLs: string[]) {
    return documentURLs.map((url) => this.localDocuments.has(url));
  }

  async disconnectRepo(localStoreID: string) {
    this.disconnectCalls.push(localStoreID);
  }

  async closeRepo(_localStoreID: string) {}

  emitDocumentChange(event: NativeRepoDocumentChangedEvent) {
    for (const listener of this.documentListeners) listener(event);
  }

  emitSyncState(event: NativeRepoSyncStateChangedEvent) {
    for (const listener of this.syncListeners) listener(event);
  }
}

async function eventually(predicate: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition did not become true");
}
