import {
  parseAutomergeUrl,
  type AutomergeUrl,
} from "@automerge/automerge-repo";
import type { AutomergeDocumentURL } from "@withorbit/core";

/** Probe Repo's durable content keys, not sync-state or document binary values. */
export async function containsIndexedDBDocumentURLs(
  databaseName: string,
  urls: readonly AutomergeDocumentURL[],
  factory: IDBFactory = indexedDB,
): Promise<boolean[]> {
  if (urls.length === 0) return [];
  const ids = urls.map(
    (url) => parseAutomergeUrl(url as unknown as AutomergeUrl).documentId,
  );
  const database = await openExistingDatabase(factory, databaseName);
  if (!database) return urls.map(() => false);
  try {
    if (!database.objectStoreNames.contains("documents")) {
      return urls.map(() => false);
    }
    return await new Promise<boolean[]>((resolve, reject) => {
      const transaction = database.transaction("documents", "readonly");
      const store = transaction.objectStore("documents");
      const result = urls.map(() => false);
      const fail = (request?: IDBRequest) =>
        reject(
          transaction.error ??
            request?.error ??
            new Error("IndexedDB presence transaction failed"),
        );
      transaction.onerror = () => fail();
      transaction.onabort = () => fail();
      transaction.oncomplete = () => resolve(result);
      try {
        ids.forEach((id, index) => {
          for (const kind of ["snapshot", "incremental"]) {
            const prefix = [id, kind];
            // The upstream adapter uses this same prefix range. Limit to one
            // key: even a long document history must remain a cheap presence check.
            const request = store.getAllKeys(
              IDBKeyRange.bound(prefix, [...prefix, "\uffff"]),
              1,
            );
            request.onerror = () => fail(request);
            request.onsuccess = () => {
              if (request.result.length) result[index] = true;
            };
          }
        });
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  } finally {
    database.close();
  }
}

function openExistingDatabase(
  factory: IDBFactory,
  name: string,
): Promise<IDBDatabase | undefined> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    let missing = false;
    let blocked = false;
    request.onupgradeneeded = () => {
      // IndexedDB cannot open a nonexistent DB read-only. Abort its initial
      // creation instead of leaving another database or object store behind.
      missing = true;
      request.transaction!.abort();
      request.result.close();
    };
    request.onerror = () => {
      if (missing) resolve(undefined);
      else reject(request.error);
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error("IndexedDB presence database open was blocked"));
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}
