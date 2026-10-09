import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
import { expect, test } from "bun:test";
import "fake-indexeddb/auto";

test("upstream IndexedDB Repo storage persists and ranges chunks", async () => {
  const databaseName = `orbit-repo-${crypto.randomUUID()}`;
  const first = new IndexedDBStorageAdapter(databaseName);
  await first.save(["document", "snapshot"], Uint8Array.of(1, 2, 3));
  await first.save(["document", "changes", "one"], Uint8Array.of(4));
  await first.close();

  const reopened = new IndexedDBStorageAdapter(databaseName);
  expect(await reopened.load(["document", "snapshot"])).toEqual(
    Uint8Array.of(1, 2, 3),
  );
  expect(await reopened.loadRange(["document", "changes"])).toEqual([
    {
      key: ["document", "changes", "one"],
      data: Uint8Array.of(4),
    },
  ]);
  await reopened.close();
});
