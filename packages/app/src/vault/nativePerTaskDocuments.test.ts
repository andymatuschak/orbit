import * as Automerge from "@automerge/automerge";
import { generateAutomergeUrl } from "@automerge/automerge-repo";
import {
  AttachmentMIMEType,
  defaultOrbitSchedulerPolicy,
  TaskContentType,
  TaskSpecType,
  TaskRepetitionOutcome,
  type AttachmentID,
  type AutomergeDocumentURL,
  type OrbitVault,
  type ObservationID,
  type TaskID,
  type VaultID,
  type VaultMutation,
  type VaultMutationID,
} from "@withorbit/core";
import {
  BinaryPerTaskDocuments,
  AutomergeAttachmentWriter,
} from "@withorbit/store-automerge";
import { describe, expect, test } from "bun:test";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { fakeNativeRepo } from "./fakeNativeRepo.testSupport.js";

describe("native Repo document adapter", () => {
  test("owns independent document subscriptions scoped to its Repo and removes them on close", async () => {
    const documents = fakeNativeRepo(new MemoryDocumentStorage());
    const url = generateAutomergeUrl() as unknown as AutomergeDocumentURL;
    const first: AutomergeDocumentURL[] = [];
    const second: AutomergeDocumentURL[] = [];
    const unsubscribeFirst = documents.subscribe((changed) =>
      first.push(changed),
    );
    const unsubscribeSecond = documents.subscribe((changed) =>
      second.push(changed),
    );
    expect(documents.documentListenerCount()).toBe(2);
    documents.emitDocumentChange({
      localStoreID: "other-repo",
      documentURL: url,
    });
    documents.emitDocumentChange({
      localStoreID: "test-repo",
      documentURL: "invalid",
    });
    documents.emitDocumentChange({
      localStoreID: "test-repo",
      documentURL: url,
    });
    expect(first).toEqual([url]);
    expect(second).toEqual([url]);
    unsubscribeFirst();
    unsubscribeFirst();
    documents.emitDocumentChange({
      localStoreID: "test-repo",
      documentURL: url,
    });
    expect(first).toEqual([url]);
    expect(second).toEqual([url, url]);
    expect(documents.documentListenerCount()).toBe(1);
    await documents.close();
    expect(documents.documentListenerCount()).toBe(0);
    unsubscribeSecond();
    documents.emitDocumentChange({
      localStoreID: "test-repo",
      documentURL: url,
    });
    expect(second).toEqual([url, url]);
    expect(() => documents.subscribe(() => undefined)).toThrow("closed");
  });

  test("closes the native Repo even when transport shutdown fails", async () => {
    const documents = fakeNativeRepo(new MemoryDocumentStorage());
    let repoClosed = false;
    documents.native.closeRepo = async () => {
      repoClosed = true;
    };
    documents.transport = {
      async close() {
        throw new Error("disconnect failed");
      },
    } as never;
    documents.subscribe(() => undefined);
    await expect(documents.close()).rejects.toThrow("disconnect failed");
    expect(repoClosed).toBe(true);
    expect(documents.documentListenerCount()).toBe(0);
  });

  test("creates directly in the Repo and waits for durable storage before returning a projection", async () => {
    const storage = new MemoryDocumentStorage();
    const documents = fakeNativeRepo(storage);
    const url = generateAutomergeUrl() as unknown as AutomergeDocumentURL;
    const save = storage.save.bind(storage);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    storage.save = async (documentURL, bytes) => {
      await pending;
      await save(documentURL, bytes);
    };
    let returned = false;
    const creation = documents
      .create({ field: "initial" }, url)
      .then((value) => {
        returned = true;
        return value;
      });
    await Promise.resolve();
    expect(returned).toBe(false);
    expect(await storage.load(url)).toBeUndefined();
    release();
    const created = await creation;
    expect(created.url).toBe(url);
    expect(created.snapshot.data).toEqual({ field: "initial" });
    expect(await storage.load(url)).toBeDefined();
    // Registration is pure bookkeeping for reconnect; it must not re-import
    // or refind a document while the ordinary native write is being observed.
    const announcements: AutomergeDocumentURL[] = [];
    documents.transport = {
      trackDocument: (documentURL: AutomergeDocumentURL) => {
        announcements.push(documentURL);
      },
      async close() {},
    } as never;
    await documents.patch(url, [
      { kind: "put", path: ["field"], value: "updated" },
    ]);
    const random = await documents.create({ field: "random" });
    expect(random.url).toStartWith("automerge:");
    expect((await documents.read(url))?.data).toEqual({ field: "updated" });
    expect(announcements).toEqual([url, random.url]);
    documents.emitDocumentChange({
      localStoreID: "test-repo",
      documentURL: url,
    });
    expect(announcements).toEqual([url, random.url]);
    await documents.close();
  });

  test("native reads verify attachments produced by the ordinary shared writer", async () => {
    const opened = await openTestVault("native-attachment-read");
    const attachmentID = "native-attachment" as AttachmentID;
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const attachment = await new AutomergeAttachmentWriter(
      opened.storage,
    ).prepare({
      attachmentID,
      bytes,
      mediaTypeHint: AttachmentMIMEType.PNG,
    });
    try {
      await opened.vault.apply([
        {
          kind: "registerAttachment",
          mutationID: "test/attachment" as VaultMutationID,
          attachmentID,
          attachment: attachment.catalogEntry,
        },
        ingestMutation(0, attachmentID),
      ]);
      expect(await opened.vault.readAttachment(attachmentID)).toEqual({
        bytes,
        mediaType: AttachmentMIMEType.PNG,
      });
      const read = opened.documents.native.readRepoAttachment;
      for (const invalid of [
        { sha256Hex: "0".repeat(64) },
        { documentURL: generateAutomergeUrl() },
        { bytes: new Uint8Array([0]) },
      ]) {
        opened.documents.native.readRepoAttachment = async (storeID, url) => ({
          ...(await read(storeID, url)),
          ...invalid,
        });
        await expect(opened.vault.readAttachment(attachmentID)).rejects.toThrow(
          "integrity",
        );
      }
      opened.documents.native.readRepoAttachment = read;
      const document = Automerge.load<{ bytes: Uint8Array }>(
        (await opened.storage.load(attachment.catalogEntry.documentURL))!,
      );
      const corrupted = Automerge.change(document, (draft) => {
        draft.bytes = new Uint8Array([0]);
      });
      try {
        await opened.storage.save(
          attachment.catalogEntry.documentURL,
          Automerge.save(corrupted),
        );
        await expect(opened.vault.readAttachment(attachmentID)).rejects.toThrow(
          "integrity",
        );
      } finally {
        Automerge.free(corrupted);
      }
    } finally {
      await opened.vault.close();
    }
  });
  test("a durable offline review can publish a shorter queue without fetching its missing tail", async () => {
    const opened = await openTestVault("offline-review-tail");
    try {
      await opened.vault.apply(
        Array.from({ length: 75 }, (_, index) => ingestMutation(index)),
      );
      const entries = await opened.vault.getCatalogEntries();
      const taskURLs = Array.from(
        { length: 75 },
        (_, index) => entries[taskID(index)].documentURL,
      );
      for (const documentURL of taskURLs.slice(50))
        await opened.storage.remove(documentURL);
      expect(await opened.vault.getReviewQueue(0)).toHaveLength(50);
      await opened.vault.apply([
        {
          kind: "recordReview",
          mutationID: "offline-tail-review" as VaultMutationID,
          observationID: "offline-tail-review" as ObservationID,
          taskID: taskID(0),
          componentID: "main",
          reviewSessionID: "WIDGET",
          outcome: TaskRepetitionOutcome.Remembered,
          occurredAtTimestampMillis: 20_000,
        },
      ]);
      const queue = await opened.vault.getReviewQueue(0);
      expect(queue).toHaveLength(49);
      expect(queue[0].task.id).toBe(taskID(1));
      const task = Automerge.load<{ observations: Record<string, unknown> }>(
        (await opened.storage.load(taskURLs[0]))!,
      );
      try {
        expect(Object.keys(task.observations)).toEqual(["offline-tail-review"]);
      } finally {
        Automerge.free(task);
      }
      await expect(
        opened.vault.getTaskProjections([taskID(50)]),
      ).rejects.toThrow("unavailable");
      await expect(opened.vault.readLogicalVault()).rejects.toThrow(
        "unavailable",
      );
    } finally {
      await opened.vault.close();
    }
  });

  test("reads and writes the per-task catalog without loading every task", async () => {
    const vaultID = "vault-native-per-task" as VaultID;
    const storage = new MemoryDocumentStorage();
    const source: OrbitVault = {
      vaultID,
      createdAtTimestampMillis: 1_000,
      scheduler: defaultOrbitSchedulerPolicy,
      tasks: {},
      observations: {},
      attachments: {},
    };
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      source,
    );
    const documents = fakeNativeRepo(storage);
    const vault = await PerTaskRepository.open(documents, created.rootURL);
    try {
      await vault.apply(
        Array.from({ length: 75 }, (_, index) => ingestMutation(index)),
      );

      const entries = await vault.getCatalogEntries();
      expect(Object.keys(entries)).toHaveLength(75);
      const { tasks } = await vault.getTaskProjections(
        Array.from({ length: 10 }, (_, index) => taskID(index)),
      );
      expect(tasks.size).toBe(10);
      expect(
        [...tasks.values()].map(
          ({ createdAtTimestampMillis }) => createdAtTimestampMillis,
        ),
      ).toEqual(Array.from({ length: 10 }, (_, index) => 1_000 + index));
      expect(await vault.getReviewQueue(0)).toHaveLength(50);
      expect(await vault.getReviewWorkingSetDocumentURLs()).toHaveLength(52);

      // Simulate a task-first write whose catalog update was interrupted.
      const catalogBeforeRepair = JSON.parse(
        (await documents.materialize(vault.catalogURL)).json,
      ) as { entries: Record<string, string> };
      const firstTaskID = taskID(0);
      const firstEntry = JSON.parse(
        catalogBeforeRepair.entries[firstTaskID],
      ) as {
        documentURL: AutomergeDocumentURL;
      };
      await documents.patch(firstEntry.documentURL, [
        { kind: "put", path: ["task", "isDeleted"], value: true },
      ]);
      expect(
        (await vault.getTaskProjections([firstTaskID])).tasks.has(firstTaskID),
      ).toBe(false);
      expect(
        Object.values(await vault.getCatalogEntries()).filter(
          (entry) => !entry.isDeleted,
        ),
      ).toHaveLength(74);
      const catalogMaterializedAfterRepair = await documents.materialize(
        vault.catalogURL,
      );
      const catalogAfterRepair = JSON.parse(
        catalogMaterializedAfterRepair.json,
      ) as { entries: Record<string, string> };
      expect(
        (
          JSON.parse(catalogAfterRepair.entries[firstTaskID]) as {
            isDeleted: boolean;
          }
        ).isDeleted,
      ).toBe(true);

      const before = (await vault.getReviewQueue(0))[0];
      await vault.apply([
        {
          kind: "recordReview",
          mutationID: "test/review/native-per-task" as VaultMutationID,
          observationID: "observation/native-per-task" as never,
          taskID: before.task.id,
          componentID: before.componentID,
          reviewSessionID: null,
          outcome: "remembered" as never,
          occurredAtTimestampMillis: 2_000,
        },
      ]);
      const after = await vault.getReviewQueue(0);
      expect(after[0]?.task.id).not.toBe(before.task.id);

      const successor = await created.rolloverCatalog();
      documents.emitDocumentChange({
        localStoreID: documents.localStoreID,
        documentURL: created.rootURL,
      });
      await vault.getReviewQueue(0);
      expect(vault.catalogURL).toBe(successor.documentURL);
    } finally {
      await vault.close();
    }
  });

  test("repairs concurrent catalog entries from the selected task document", async () => {
    const storage = new MemoryDocumentStorage();
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      {
        vaultID: "equivalent-catalog-conflict" as VaultID,
        createdAtTimestampMillis: 1_000,
        scheduler: defaultOrbitSchedulerPolicy,
        tasks: {},
        observations: {},
        attachments: {},
      },
    );
    await created.apply([ingestMutation(0)]);
    const original = (await storage.load(created.catalogURL))!;
    const base = Automerge.load<{
      entries: Record<string, Automerge.ImmutableString>;
    }>(original);
    const entry = JSON.parse(base.entries[taskID(0)].toString()) as Record<
      string,
      unknown
    >;
    const browser = Automerge.change(
      Automerge.load<typeof base>(original, { actor: "aaaaaaaaaaaaaaaa" }),
      (draft) => {
        draft.entries[taskID(0)] = new Automerge.ImmutableString(
          JSON.stringify(Object.fromEntries(Object.entries(entry).reverse())),
        );
      },
    );
    const native = Automerge.change(
      Automerge.load<typeof base>(original, { actor: "bbbbbbbbbbbbbbbb" }),
      (draft) => {
        const fields = Object.entries(entry);
        draft.entries[taskID(0)] = new Automerge.ImmutableString(
          JSON.stringify(Object.fromEntries([...fields.slice(1), fields[0]])),
        );
      },
    );
    const browserBytes = Automerge.save(browser);
    const merged = Automerge.merge(browser, native);
    expect(
      Object.keys(Automerge.getConflicts(merged.entries, taskID(0)) ?? {}),
    ).toHaveLength(2);
    await storage.save(created.catalogURL, Automerge.save(merged));

    const documents = fakeNativeRepo(storage);
    const vault = await PerTaskRepository.open(documents, created.rootURL);
    expect((await vault.getReviewQueue(0))[0]?.task.id).toBe(taskID(0));
    await waitForCatalogRepair(storage, created.catalogURL);
    expect(await catalogConflictCount(storage, created.catalogURL)).toBe(0);
    await vault.close();

    const divergent = Automerge.change(
      Automerge.load<typeof base>(original, { actor: "cccccccccccccccc" }),
      (draft) => {
        draft.entries[taskID(0)] = new Automerge.ImmutableString(
          JSON.stringify({ ...entry, nextDueTimestampMillis: 99_999 }),
        );
      },
    );
    await storage.save(
      created.catalogURL,
      Automerge.save(Automerge.merge(Automerge.load(browserBytes), divergent)),
    );
    const divergentVault = await PerTaskRepository.open(
      fakeNativeRepo(storage),
      created.rootURL,
    );
    await waitForCatalogRepair(storage, created.catalogURL);
    expect(await catalogConflictCount(storage, created.catalogURL)).toBe(0);
    expect(
      await catalogEntryValue(storage, created.catalogURL, taskID(0)),
    ).toEqual(entry);
    await divergentVault.close();

    // Two conflicting URLs use Automerge's visible winner as the tie-breaker.
    const alternateURL =
      generateAutomergeUrl() as unknown as AutomergeDocumentURL;
    await storage.save(
      alternateURL,
      (await storage.load(entry.documentURL as AutomergeDocumentURL))!,
    );
    const alternate = Automerge.change(
      Automerge.load<typeof base>(original, { actor: "dddddddddddddddd" }),
      (draft) => {
        draft.entries[taskID(0)] = new Automerge.ImmutableString(
          JSON.stringify({ ...entry, documentURL: alternateURL }),
        );
      },
    );
    const urlConflict = Automerge.merge(
      Automerge.load<{ entries: Record<string, Automerge.ImmutableString> }>(
        browserBytes,
      ),
      alternate,
    );
    const visibleURL = (
      JSON.parse(urlConflict.entries[taskID(0)].toString()) as {
        documentURL: AutomergeDocumentURL;
      }
    ).documentURL;
    await storage.save(created.catalogURL, Automerge.save(urlConflict));
    const browserStorage = new MemoryDocumentStorage();
    for (const documentURL of [
      created.rootURL,
      created.catalogURL,
      entry.documentURL as AutomergeDocumentURL,
      alternateURL,
    ]) {
      await browserStorage.save(
        documentURL,
        (await storage.load(documentURL))!,
      );
    }
    const browserVault = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(browserStorage),
      created.rootURL,
    );
    const urlVault = await PerTaskRepository.open(
      fakeNativeRepo(storage),
      created.rootURL,
    );
    await waitForCatalogRepair(storage, created.catalogURL);
    expect(await catalogConflictCount(storage, created.catalogURL)).toBe(0);
    expect(
      (await catalogEntryValue(storage, created.catalogURL, taskID(0)))
        .documentURL,
    ).toBe(visibleURL);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        (await catalogConflictCount(browserStorage, created.catalogURL)) === 0
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(await catalogConflictCount(browserStorage, created.catalogURL)).toBe(
      0,
    );
    expect(
      await catalogEntryValue(browserStorage, created.catalogURL, taskID(0)),
    ).toEqual(await catalogEntryValue(storage, created.catalogURL, taskID(0)));
    await browserVault.close();
    await urlVault.close();

    // A conflict in an unrelated, not-yet-downloaded task must not prevent
    // the vault itself from opening offline.
    await storage.save(created.catalogURL, Automerge.save(urlConflict));
    await storage.remove(visibleURL);
    const offlineVault = await PerTaskRepository.open(
      fakeNativeRepo(storage),
      created.rootURL,
    );
    await offlineVault.close();
  });

  test("new native vaults contain just the root and catalog", async () => {
    const opened = await openTestVault("bounded-native");
    try {
      expect(opened.storage.documentCount).toBe(2);
      await opened.vault.apply(
        Array.from({ length: 75 }, (_, index) => ingestMutation(index)),
      );

      expect(Object.keys(await opened.vault.getCatalogEntries())).toHaveLength(
        75,
      );
      const { tasks } = await opened.vault.getTaskProjections(
        Array.from({ length: 10 }, (_, index) => taskID(index)),
      );
      expect(tasks.size).toBe(10);
      expect(
        [...tasks.values()].map(
          ({ createdAtTimestampMillis }) => createdAtTimestampMillis,
        ),
      ).toEqual(Array.from({ length: 10 }, (_, index) => 1_000 + index));
      expect(await opened.vault.getReviewQueue(0)).toHaveLength(50);
    } finally {
      await opened.vault.close();
    }
  });
});

async function openTestVault(name: string) {
  const vaultID = `vault-${name}` as VaultID;
  const storage = new MemoryDocumentStorage();
  const documents = fakeNativeRepo(storage);
  const created = await PerTaskRepository.createEmpty(
    new BinaryPerTaskDocuments(storage),
    { vaultID },
  );
  const rootDocumentURL = created.rootURL;
  await created.close();
  return {
    vault: await PerTaskRepository.open(documents, rootDocumentURL),
    storage,
    documents,
  };
}

function ingestMutation(
  index: number,
  attachmentID?: AttachmentID,
): VaultMutation {
  return {
    kind: "ingestTask",
    mutationID: `test/ingest/${index}` as VaultMutationID,
    task: {
      taskID: taskID(index),
      createdAtTimestampMillis: 1_000 + index,
      spec: {
        type: TaskSpecType.Memory,
        content: {
          type: TaskContentType.Plain,
          body: {
            text: `Task ${index}`,
            attachments: attachmentID ? [attachmentID] : [],
          },
        },
      },
      provenance: null,
      metadata: {},
    },
  };
}

function taskID(index: number): TaskID {
  return `native-task-${String(index).padStart(3, "0")}` as TaskID;
}

async function catalogConflictCount(
  storage: MemoryDocumentStorage,
  catalogURL: AutomergeDocumentURL,
) {
  const document = Automerge.load<{
    entries: Record<string, Automerge.ImmutableString>;
  }>((await storage.load(catalogURL))!);
  try {
    return Object.keys(
      Automerge.getConflicts(document.entries, taskID(0)) ?? {},
    ).length;
  } finally {
    Automerge.free(document);
  }
}

async function waitForCatalogRepair(
  storage: MemoryDocumentStorage,
  catalogURL: AutomergeDocumentURL,
) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await catalogConflictCount(storage, catalogURL)) === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for shared catalog repair");
}

async function catalogEntryValue(
  storage: MemoryDocumentStorage,
  catalogURL: AutomergeDocumentURL,
  taskID: TaskID,
): Promise<Record<string, unknown>> {
  const document = Automerge.load<{
    entries: Record<string, Automerge.ImmutableString>;
  }>((await storage.load(catalogURL))!);
  try {
    return JSON.parse(document.entries[taskID].toString()) as Record<
      string,
      unknown
    >;
  } finally {
    Automerge.free(document);
  }
}

class MemoryDocumentStorage {
  private readonly values = new Map<AutomergeDocumentURL, Uint8Array>();

  get documentCount() {
    return this.values.size;
  }

  async load(documentURL: AutomergeDocumentURL) {
    const value = this.values.get(documentURL);
    return value ? Uint8Array.from(value) : undefined;
  }

  async save(documentURL: AutomergeDocumentURL, bytes: Uint8Array) {
    this.values.set(documentURL, Uint8Array.from(bytes));
  }

  async remove(documentURL: AutomergeDocumentURL) {
    this.values.delete(documentURL);
  }

  async close() {}
}
