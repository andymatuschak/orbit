import type { AutomergeDocumentURL, TaskID } from "@withorbit/core";
import type { PerTaskCatalogEntry } from "@withorbit/store-shared/perTaskVault";
import { expect, test } from "bun:test";
import { syncCachedTaskDocuments } from "./syncCachedTaskDocuments.js";

test("cached-task enrollment starts later, yields in bounded batches, and skips absent histories", async () => {
  const urls = Array.from(
    { length: 70 },
    (_, index) => `automerge:task-${index}` as AutomergeDocumentURL,
  );
  const local = new Set(urls.filter((_, index) => index % 3 === 0));
  const batches: AutomergeDocumentURL[][] = [];
  const enrolled: AutomergeDocumentURL[] = [];
  const vault = fixture(urls);
  let catalogReads = 0;
  const getEntries = vault.getCatalogEntries;
  vault.getCatalogEntries = async () => {
    catalogReads++;
    return getEntries();
  };
  const operation = syncCachedTaskDocuments(
    vault,
    async (batch) => {
      batches.push([...batch]);
      return batch.map((url) => local.has(url));
    },
    async (batch) => {
      enrolled.push(...batch);
    },
  );
  expect(catalogReads).toBe(0);
  expect(enrolled).toEqual([]);
  await operation;
  expect(catalogReads).toBe(1);
  expect(batches.map((batch) => batch.length)).toEqual([32, 32, 6]);
  expect(enrolled).toEqual([...local]);
});

test("closing before the background pass avoids even reading the catalog", async () => {
  const vault = fixture([]);
  vault.isClosed = true;
  vault.getCatalogEntries = async () => {
    throw new Error("must not read after close");
  };
  await syncCachedTaskDocuments(
    vault,
    async () => [],
    async () => {
      throw new Error("must not enroll");
    },
  );
});

test("closing during presence lookup cancels enrollment and tolerates its close error", async () => {
  const vault = fixture(["automerge:cached" as AutomergeDocumentURL]);
  await syncCachedTaskDocuments(
    vault,
    async () => {
      vault.isClosed = true;
      throw new Error("storage closed during lookup");
    },
    async () => {
      throw new Error("must not enroll after close");
    },
  );
});

function fixture(urls: readonly AutomergeDocumentURL[]) {
  return {
    isClosed: false,
    async getCatalogEntries(): Promise<Record<TaskID, PerTaskCatalogEntry>> {
      return Object.fromEntries(
        urls.map((url, index) => [
          `task-${index}`,
          {
            documentURL: url,
            nextDueTimestampMillis: 0,
            isDeleted: false,
            indexedTaskHeads: [],
          },
        ]),
      ) as Record<TaskID, PerTaskCatalogEntry>;
    },
  };
}
