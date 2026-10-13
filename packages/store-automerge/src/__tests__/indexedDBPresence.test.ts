import {
  generateAutomergeUrl,
  parseAutomergeUrl,
  type AutomergeUrl,
} from "@automerge/automerge-repo";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import type { AutomergeDocumentURL } from "@withorbit/core";
import { expect, spyOn, test } from "bun:test";
import "fake-indexeddb/auto";
import { containsIndexedDBDocumentURLs } from "../indexedDBPresence.js";

function document() {
  const url = generateAutomergeUrl() as unknown as AutomergeDocumentURL;
  return {
    url,
    id: parseAutomergeUrl(url as unknown as AutomergeUrl).documentId,
  };
}

function open(name: string, createStore = true) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      if (createStore) request.result.createObjectStore("documents");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

test("presence distinguishes durable chunks from sync-state and unrelated documents", async () => {
  const name = `presence-${crypto.randomUUID()}`;
  const snapshot = document();
  const incremental = document();
  const bookkeeping = document();
  const absent = document();
  const storage = new IndexedDBStorageAdapter(name);
  await storage.save([snapshot.id, "snapshot", "hash"], Uint8Array.of(1));
  await storage.save([incremental.id, "incremental", "hash"], Uint8Array.of(2));
  await storage.save([bookkeeping.id, "sync-state", "peer"], Uint8Array.of(3));
  await storage.save(
    [absent.id + "other", "snapshot", "hash"],
    Uint8Array.of(4),
  );
  await storage.close();
  expect(
    await containsIndexedDBDocumentURLs(name, [
      snapshot.url,
      incremental.url,
      bookkeeping.url,
      absent.url,
      snapshot.url,
    ]),
  ).toEqual([true, true, false, false, true]);
});

test("empty candidates open nothing; probing a missing database does not create it", async () => {
  const emptyOpen = spyOn(indexedDB, "open");
  try {
    expect(await containsIndexedDBDocumentURLs("unused", [])).toEqual([]);
    expect(emptyOpen).not.toHaveBeenCalled();
  } finally {
    emptyOpen.mockRestore();
  }
  const name = `missing-${crypto.randomUUID()}`;
  expect(await containsIndexedDBDocumentURLs(name, [document().url])).toEqual([
    false,
  ]);
  const request = indexedDB.open(name, 1);
  let initialCreation = false;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => {
      initialCreation = true;
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  expect(initialCreation).toBe(true);
  expect(db.objectStoreNames.length).toBe(0);
  db.close();
});

test("an existing database without Repo's store is not upgraded", async () => {
  const name = `empty-${crypto.randomUUID()}`;
  const db = await open(name, false);
  db.close();
  expect(await containsIndexedDBDocumentURLs(name, [document().url])).toEqual([
    false,
  ]);
  const reopened = await open(name);
  expect(reopened.objectStoreNames.length).toBe(0);
  reopened.close();
});

test("presence uses bounded, key-only readonly probes and closes its connection", async () => {
  const name = `key-only-${crypto.randomUUID()}`;
  const cached = document();
  const unrelated = document();
  const storage = new IndexedDBStorageAdapter(name);
  await storage.save([cached.id, "snapshot", "hash"], new Uint8Array(1024));
  await storage.save([unrelated.id, "snapshot", "hash"], new Uint8Array(1024));
  await storage.close();

  const reads = ["get", "getAll", "openCursor"] as const;
  const forbidden = reads.map((method) =>
    spyOn(IDBObjectStore.prototype, method).mockImplementation(() => {
      throw new Error("binary values must not be read");
    }),
  );
  const keys = spyOn(IDBObjectStore.prototype, "getAllKeys");
  const transaction = spyOn(IDBDatabase.prototype, "transaction");
  const close = spyOn(IDBDatabase.prototype, "close");
  try {
    expect(await containsIndexedDBDocumentURLs(name, [cached.url])).toEqual([
      true,
    ]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]).toEqual(["documents", "readonly"]);
    expect(keys).toHaveBeenCalledTimes(2);
    for (const [range, count] of keys.mock.calls) {
      expect(count).toBe(1);
      const bounded = range as IDBKeyRange;
      expect((bounded.lower as string[])[0]).toBe(cached.id);
      expect((bounded.upper as string[])[0]).toBe(cached.id);
    }
    for (const read of forbidden) expect(read).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    for (const read of forbidden) read.mockRestore();
    keys.mockRestore();
    transaction.mockRestore();
    close.mockRestore();
  }
});

test("a transaction aborted after a successful key read rejects and closes", async () => {
  const name = `aborted-${crypto.randomUUID()}`;
  const cached = document();
  const storage = new IndexedDBStorageAdapter(name);
  await storage.save([cached.id, "snapshot", "hash"], Uint8Array.of(1));
  await storage.close();
  const original = IDBObjectStore.prototype.getAllKeys;
  const keys = spyOn(IDBObjectStore.prototype, "getAllKeys").mockImplementation(
    function (this: IDBObjectStore, query, count) {
      const request = original.call(this, query, count);
      request.addEventListener("success", () => this.transaction.abort(), {
        once: true,
      });
      return request;
    },
  );
  const close = spyOn(IDBDatabase.prototype, "close");
  try {
    await expect(
      containsIndexedDBDocumentURLs(name, [cached.url]),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    keys.mockRestore();
    close.mockRestore();
  }
});

test("a key request failure rejects and closes the readonly connection", async () => {
  const name = `failed-${crypto.randomUUID()}`;
  (await open(name)).close();
  const keys = spyOn(IDBObjectStore.prototype, "getAllKeys").mockImplementation(
    () => {
      throw new DOMException("key read failed", "UnknownError");
    },
  );
  const close = spyOn(IDBDatabase.prototype, "close");
  try {
    await expect(
      containsIndexedDBDocumentURLs(name, [document().url]),
    ).rejects.toMatchObject({ name: "UnknownError", message: "key read failed" });
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    keys.mockRestore();
    close.mockRestore();
  }
});
