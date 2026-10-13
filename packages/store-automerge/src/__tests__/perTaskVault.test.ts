import {
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  defaultOrbitSchedulerPolicy,
  type AutomergeDocumentURL,
  type ObservationID,
  type OrbitVault,
  type TaskID,
  type VaultID,
  type VaultMutationID,
} from "@withorbit/core";
import { generateAutomergeUrl } from "@automerge/automerge-repo";
import * as Automerge from "@automerge/automerge";
import { describe, expect, test } from "bun:test";
import type { AutomergeBinaryStorage } from "../binaryStorage.js";
import { MemoryAutomergeBinaryStorage } from "../binaryStorage.js";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { BinaryPerTaskDocuments } from "../repoPerTaskDocuments.js";
import type { PerTaskDocuments } from "@withorbit/store-shared/perTaskRepository";

const vaultID = "per-task-test-vault" as VaultID;

describe("per-task Automerge vault", () => {
  test("unsupported scheduler policies are rejected before any document is created", async () => {
    const source = logicalVault(0);
    const storage = new MemoryAutomergeBinaryStorage();
    source.scheduler = {
      kind: "fsrs",
      version: 1,
    } as unknown as OrbitVault["scheduler"];
    await expect(
      PerTaskRepository.create(new BinaryPerTaskDocuments(storage), source),
    ).rejects.toThrow("supported orbit-sm2-like");
    expect(storage.documentCount).toBe(0);
  });
  test("repairing a deleted capped window reselects the next due task", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const taskURLs = Object.fromEntries(
      Array.from({ length: 51 }, (_, index) => [
        taskID(index),
        url("deleted-window-" + index),
      ]),
    );
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(51),
      { taskURLs },
    );
    const documents = new BinaryPerTaskDocuments(storage);
    for (let index = 0; index < 50; index++) {
      await documents.patch(taskURLs[taskID(index)], [
        { kind: "put", path: ["task", "isDeleted"], value: true },
      ]);
    }
    const opened = await PerTaskRepository.open(documents, created.rootURL);
    try {
      expect(
        (await opened.getReviewQueue(0)).map(({ task }) => task.id),
      ).toEqual([taskID(50)]);
      expect(await opened.getReviewWorkingSetDocumentURLs()).toEqual([
        created.rootURL,
        created.catalogURL,
        taskURLs[taskID(50)],
      ]);
      await storage.remove(taskURLs[taskID(50)]);
      await expect(opened.getReviewQueue(0)).rejects.toThrow("unavailable");
    } finally {
      await opened.close();
      await created.close();
    }
  });

  test("a partial offline queue stays readable and a fetched absent head reappears", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const headURL = url("partial-head");
    const tailURL = url("partial-tail");
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(3),
      {
        taskURLs: { [taskID(0)]: headURL, [taskID(2)]: tailURL },
      },
    );
    const headBytes = (await storage.load(headURL))!;
    await storage.remove(headURL);
    await storage.remove(tailURL);
    let releaseFetch!: () => void;
    const fetchBarrier = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const fetched: AutomergeDocumentURL[] = [];
    const documents: PerTaskDocuments = new BinaryPerTaskDocuments(storage);
    documents.fetch = async (documentURL) => {
      fetched.push(documentURL);
      await fetchBarrier;
      if (documentURL !== headURL) return false;
      await storage.save(headURL, headBytes);
      return true;
    };
    const opened = await PerTaskRepository.open(documents, created.rootURL);
    let updates = 0;
    const unsubscribe = opened.subscribe(() => {
      updates++;
    });
    try {
      expect(
        (await opened.getReviewQueue(10_000)).map(({ task }) => task.id),
      ).toEqual([taskID(1)]);
      expect(fetched).toEqual([headURL, tailURL]);
      expect(Object.keys(await opened.getCatalogEntries())).toHaveLength(3);
      await expect(opened.getTaskProjections([taskID(0)])).rejects.toThrow(
        "unavailable",
      );
      await expect(opened.readLogicalVault()).rejects.toThrow("unavailable");
      releaseFetch();
      await waitFor(async () => updates > 0);
      expect(
        (await opened.getReviewQueue(10_000)).map(({ task }) => task.id),
      ).toEqual([taskID(0), taskID(1)]);
    } finally {
      releaseFetch();
      unsubscribe();
      await opened.close();
      await created.close();
    }
  });

  test("a missing task is not hidden by a stale catalog's deleted local task", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const localURL = url("deleted-local-prompt");
    const missingURL = url("missing-after-deleted-prompt");
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(2),
      {
        taskURLs: { [taskID(0)]: localURL, [taskID(1)]: missingURL },
      },
    );
    const documents = new BinaryPerTaskDocuments(storage);
    await documents.patch(localURL, [
      { kind: "put", path: ["task", "isDeleted"], value: true },
    ]);
    await storage.remove(missingURL);
    const opened = await PerTaskRepository.open(documents, created.rootURL);
    try {
      await expect(opened.getReviewQueue(10_000)).rejects.toThrow(
        "unavailable",
      );
      await expect(opened.getTaskProjections([taskID(1)])).rejects.toThrow(
        "unavailable",
      );
    } finally {
      await opened.close();
      await created.close();
    }
  });

  test("partial queues still reject malformed and conflicted present task documents", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const presentURL = url("invalid-present-prompt");
    const missingURL = url("invalid-missing-tail");
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(2),
      {
        taskURLs: { [taskID(0)]: presentURL, [taskID(1)]: missingURL },
      },
    );
    const original = (await storage.load(presentURL))!;
    await storage.remove(missingURL);
    const documents = new BinaryPerTaskDocuments(storage);
    const opened = await PerTaskRepository.open(documents, created.rootURL);
    try {
      await documents.patch(presentURL, [
        { kind: "put", path: ["schemaVersion"], value: 99 },
      ]);
      await expect(opened.getReviewQueue(10_000)).rejects.toThrow(
        "schemaVersion",
      );
      await expect(
        opened.getTaskProjections([taskID(0), taskID(1)]),
      ).rejects.toThrow("schemaVersion");
      let left = Automerge.load<{
        task: { metadata: Record<string, Automerge.ImmutableString> };
      }>(original, { actor: "aaaaaaaaaaaaaaaa" });
      let right = Automerge.load<typeof left>(original, {
        actor: "bbbbbbbbbbbbbbbb",
      });
      left = Automerge.change(left, (draft) => {
        draft.task.metadata.source = new Automerge.ImmutableString("left");
      });
      right = Automerge.change(right, (draft) => {
        draft.task.metadata.source = new Automerge.ImmutableString("right");
      });
      const conflicted = Automerge.merge(left, right);
      try {
        await storage.save(presentURL, Automerge.save(conflicted));
      } finally {
        Automerge.free(conflicted);
        Automerge.free(right);
      }
      await expect(opened.getReviewQueue(10_000)).rejects.toThrow("conflicts");
      await expect(
        opened.getTaskProjections([taskID(0), taskID(1)]),
      ).rejects.toThrow("conflicts");
    } finally {
      await opened.close();
      await created.close();
    }
  });

  test("a missing due task is not hidden by a stale catalog's not-due local task", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const localURL = url("not-due-local-prompt");
    const missingURL = url("missing-after-not-due-prompt");
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(2),
      {
        taskURLs: { [taskID(0)]: localURL, [taskID(1)]: missingURL },
      },
    );
    const documents = new BinaryPerTaskDocuments(storage);
    await documents.patch(localURL, [
      {
        kind: "put",
        path: ["observations", "future-review"],
        value: JSON.stringify([
          "r",
          taskID(0),
          "main",
          20_000,
          null,
          TaskRepetitionOutcome.Remembered,
        ]),
      },
    ]);
    await storage.remove(missingURL);
    const opened = await PerTaskRepository.open(documents, created.rootURL);
    try {
      await expect(opened.getReviewQueue(0)).rejects.toThrow("unavailable");
    } finally {
      await opened.close();
      await created.close();
    }
  });

  test("opens only the catalog-selected queue-sized task set", async () => {
    const backing = new MemoryAutomergeBinaryStorage();
    const storage = new TrackingStorage(backing);
    const source = logicalVault(75);
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      source,
    );
    const reopened = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(storage),
      created.rootURL,
    );
    storage.loads.length = 0;

    const queue = await reopened.getReviewQueue(10_000, 50);

    expect(queue).toHaveLength(50);
    // Root + catalog refresh, then only the 50 selected task documents.
    expect(storage.loads).toHaveLength(52);
    expect(new Set(queue.map(({ task }) => task.id)).size).toBe(50);
  });

  test("repairs a crash after the authoritative task save", async () => {
    const backing = new MemoryAutomergeBinaryStorage();
    const rootURL = url("root");
    const catalogURL = url("catalog");
    const taskURL = url("task");
    const storage = new FailOnceStorage(backing);
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(1),
      {
        rootURL,
        catalogURL,
        taskURLs: { [taskID(0)]: taskURL },
      },
    );
    storage.failNextSaveTo = catalogURL;

    await expect(
      created.apply([review(taskID(0), "crash-review", 20_000)]),
    ).rejects.toThrow("injected catalog save failure");

    const reopened = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(backing),
      rootURL,
    );
    expect((await reopened.getProjection()).observationCount).toBe(1);
    expect(await reopened.repairCatalog()).toBe(1);
    expect(await reopened.repairCatalog()).toBe(0);
  });

  test("repairs stale catalog heads when a selected task is read", async () => {
    const backing = new MemoryAutomergeBinaryStorage();
    const catalogURL = url("selected-repair-catalog");
    const storage = new FailOnceStorage(backing);
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(1),
      { catalogURL },
    );
    storage.failNextSaveTo = catalogURL;
    await expect(
      created.apply([review(taskID(0), "selected-repair-review", 20_000)]),
    ).rejects.toThrow("injected catalog save failure");

    const reopened = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(backing),
      created.rootURL,
    );
    expect((await reopened.getTaskProjections([taskID(0)])).tasks.size).toBe(1);
    expect(await reopened.repairCatalog()).toBe(0);
  });

  test("concurrent offline reviews converge before catalog repair", async () => {
    const base = new MemoryAutomergeBinaryStorage();
    const rootURL = url("concurrent-root");
    const catalogURL = url("concurrent-catalog");
    const taskURL = url("concurrent-task");
    await PerTaskRepository.create(
      new BinaryPerTaskDocuments(base),
      logicalVault(1),
      {
        rootURL,
        catalogURL,
        taskURLs: { [taskID(0)]: taskURL },
      },
    );
    const leftStorage = await cloneStorage(base, [
      rootURL,
      catalogURL,
      taskURL,
    ]);
    const rightStorage = await cloneStorage(base, [
      rootURL,
      catalogURL,
      taskURL,
    ]);
    const left = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(leftStorage),
      rootURL,
    );
    const right = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(rightStorage),
      rootURL,
    );
    await left.apply([review(taskID(0), "left-review", 20_000)]);
    await right.apply([review(taskID(0), "right-review", 30_000)]);

    const merged = new MemoryAutomergeBinaryStorage();
    for (const documentURL of [rootURL, catalogURL, taskURL]) {
      const leftBytes = (await leftStorage.load(documentURL))!;
      const rightBytes = (await rightStorage.load(documentURL))!;
      const Automerge = await import("@automerge/automerge");
      const leftDocument = Automerge.load(leftBytes);
      const rightDocument = Automerge.load(rightBytes);
      const result = Automerge.merge(leftDocument, rightDocument);
      await merged.save(documentURL, Automerge.save(result));
      Automerge.free(result);
      Automerge.free(rightDocument);
    }

    const converged = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(merged),
      rootURL,
    );
    expect((await converged.getProjection()).observationCount).toBe(2);
    expect(await converged.repairCatalog()).toBe(1);
    expect(
      (await converged.getProjection()).tasks.get(taskID(0))?.componentStates
        .main,
    ).toMatchObject({ lastRepetitionTimestampMillis: 30_000 });
  });

  test("browser repairs a conflicting entry in the background using the visible URL", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const rootURL = url("url-conflict-root");
    const catalogURL = url("url-conflict-catalog");
    const taskURL = url("url-conflict-task");
    const alternateURL = url("url-conflict-alternate-task");
    await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(1),
      {
        rootURL,
        catalogURL,
        taskURLs: { [taskID(0)]: taskURL },
      },
    );
    await storage.save(alternateURL, (await storage.load(taskURL))!);
    const original = (await storage.load(catalogURL))!;
    const base = Automerge.load<{
      entries: Record<string, Automerge.ImmutableString>;
    }>(original);
    const entry = JSON.parse(base.entries[taskID(0)].toString()) as Record<
      string,
      unknown
    >;
    const first = Automerge.change(
      Automerge.load<typeof base>(original, { actor: "aaaaaaaaaaaaaaaa" }),
      (draft) => {
        draft.entries[taskID(0)] = new Automerge.ImmutableString(
          JSON.stringify(Object.fromEntries(Object.entries(entry).reverse())),
        );
      },
    );
    const second = Automerge.change(
      Automerge.load<typeof base>(original, { actor: "bbbbbbbbbbbbbbbb" }),
      (draft) => {
        draft.entries[taskID(0)] = new Automerge.ImmutableString(
          JSON.stringify({ ...entry, documentURL: alternateURL }),
        );
      },
    );
    const merged = Automerge.merge(first, second);
    const visibleURL = (
      JSON.parse(merged.entries[taskID(0)].toString()) as {
        documentURL: AutomergeDocumentURL;
      }
    ).documentURL;
    expect(
      Object.keys(Automerge.getConflicts(merged.entries, taskID(0)) ?? {}),
    ).toHaveLength(2);
    await storage.save(catalogURL, Automerge.save(merged));

    const opened = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(storage),
      rootURL,
    );
    expect(await opened.getReviewQueue(10_000)).toHaveLength(1);
    await waitFor(async () => {
      const bytes = (await storage.load(catalogURL))!;
      const document = Automerge.load<{
        entries: Record<string, Automerge.ImmutableString>;
      }>(bytes);
      try {
        return (
          Object.keys(Automerge.getConflicts(document.entries, taskID(0)) ?? {})
            .length === 0
        );
      } finally {
        Automerge.free(document);
      }
    });
    const repaired = Automerge.load<{
      entries: Record<string, Automerge.ImmutableString>;
    }>((await storage.load(catalogURL))!);
    expect(
      Object.keys(Automerge.getConflicts(repaired.entries, taskID(0)) ?? {}),
    ).toHaveLength(0);
    expect(
      (
        JSON.parse(repaired.entries[taskID(0)].toString()) as {
          documentURL: AutomergeDocumentURL;
        }
      ).documentURL,
    ).toBe(visibleURL);
    await opened.close();
  });

  test("falls back from a missing generation and replaces it with a successor", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(3),
    );
    const missingURL = url("missing-generation");
    const missing = await created.rolloverCatalog(missingURL);
    expect(missing.generation).toBe(1);
    await storage.remove(missingURL);

    const fallback = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(storage),
      created.rootURL,
    );
    expect(fallback.catalogURL).not.toBe(missingURL);
    const fallbackURL = fallback.catalogURL;
    const replacementURL = url("replacement-generation");
    const replacement = await fallback.rolloverCatalog(replacementURL);
    expect(replacement).toMatchObject({
      generation: 2,
      documentURL: replacementURL,
      predecessorDocumentURL: fallbackURL,
    });

    const reopened = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(storage),
      created.rootURL,
    );
    expect(reopened.catalogURL).toBe(replacementURL);
    expect(await reopened.getReviewQueue(10_000)).toHaveLength(3);
  });

  test("a crash publishing the catalog or its descriptor leaves the old generation usable", async () => {
    for (const boundary of ["catalog", "root"] as const) {
      const backing = new MemoryAutomergeBinaryStorage();
      const storage = new FailOnceStorage(backing);
      const created = await PerTaskRepository.create(
        new BinaryPerTaskDocuments(storage),
        logicalVault(1),
      );
      const nextURL = generateAutomergeUrl() as AutomergeDocumentURL;
      storage.failNextSaveTo =
        boundary === "catalog" ? nextURL : created.rootURL;
      await expect(created.rolloverCatalog(nextURL)).rejects.toThrow(
        "injected catalog save failure",
      );
      expect(Boolean(await backing.load(nextURL))).toBe(boundary === "root");
      const reopened = await PerTaskRepository.open(
        new BinaryPerTaskDocuments(backing),
        created.rootURL,
      );
      expect(reopened.catalogURL).toBe(created.catalogURL);
      expect(await reopened.getReviewQueue(10_000)).toHaveLength(1);
      await reopened.close();
      await created.close();
    }
  });

  test("concurrent rollover candidates elect the same catalog in either merge order", async () => {
    const base = new MemoryAutomergeBinaryStorage();
    const taskURL = url("rollover-task");
    const original = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(base),
      logicalVault(1),
      {
        taskURLs: { [taskID(0)]: taskURL },
      },
    );
    const urls = [original.rootURL, original.catalogURL, taskURL];
    const leftStorage = await cloneStorage(base, urls);
    const rightStorage = await cloneStorage(base, urls);
    const left = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(leftStorage),
      original.rootURL,
    );
    const right = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(rightStorage),
      original.rootURL,
    );
    const a = await left.rolloverCatalog();
    const b = await right.rolloverCatalog();
    const elected: AutomergeDocumentURL[] = [];
    for (const [first, second] of [
      [leftStorage, rightStorage],
      [rightStorage, leftStorage],
    ]) {
      const merged = await cloneStorage(base, [original.catalogURL, taskURL]);
      await mergeDocument(merged, original.rootURL, first, second);
      await merged.save(
        a.documentURL,
        (await leftStorage.load(a.documentURL))!,
      );
      await merged.save(
        b.documentURL,
        (await rightStorage.load(b.documentURL))!,
      );
      const opened = await PerTaskRepository.open(
        new BinaryPerTaskDocuments(merged),
        original.rootURL,
      );
      elected.push(opened.catalogURL);
      expect(await opened.getReviewQueue(10_000)).toHaveLength(1);
      await opened.close();
    }
    expect(elected[0]).toBe(elected[1]);
    expect([a.documentURL, b.documentURL]).toContain(elected[0]);
    await left.close();
    await right.close();
    await original.close();
  });

  test("a catalog descendant is valid but unrelated bytes at its URL are not", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(1),
    );
    const previousURL = created.catalogURL;
    const next = await created.rolloverCatalog();
    await created.apply([review(taskID(0), "descendant-review", 20_000)]);
    const descendant = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(storage),
      created.rootURL,
    );
    expect(descendant.catalogURL).toBe(next.documentURL);
    await descendant.close();
    // Same logical catalog shape, different Automerge causal identity.
    const unrelated = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(1),
    );
    const other = await unrelated.rolloverCatalog();
    await storage.save(
      next.documentURL,
      (await storage.load(other.documentURL))!,
    );
    const fallback = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(storage),
      created.rootURL,
    );
    expect(fallback.catalogURL).toBe(previousURL);
    await fallback.close();
    await unrelated.close();
    await created.close();
  });

  test("an offline task review repairs the new generation without merging obsolete catalogs", async () => {
    const onlineStorage = new MemoryAutomergeBinaryStorage();
    const taskURL = url("offline-rollover-task");
    const online = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(onlineStorage),
      logicalVault(1),
      {
        taskURLs: { [taskID(0)]: taskURL },
      },
    );
    const offlineStorage = await cloneStorage(onlineStorage, [
      online.rootURL,
      online.catalogURL,
      taskURL,
    ]);
    const offline = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(offlineStorage),
      online.rootURL,
    );
    const next = await online.rolloverCatalog();
    await offline.apply([review(taskID(0), "offline-rollover-review", 20_000)]);
    await mergeDocument(onlineStorage, taskURL, onlineStorage, offlineStorage);
    const reopened = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(onlineStorage),
      online.rootURL,
    );
    expect(reopened.catalogURL).toBe(next.documentURL);
    expect(await reopened.repairCatalog()).toBe(1);
    expect(await reopened.repairCatalog()).toBe(0);
    expect((await reopened.getProjection()).observationCount).toBe(1);
    await reopened.close();
    await online.close();
    await offline.close();
  });

  test("rollover refuses an incomplete task set and leaves the root unchanged", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const taskURL = url("missing-rollover-task");
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(1),
      {
        taskURLs: { [taskID(0)]: taskURL },
      },
    );
    const before = await storage.load(created.rootURL);
    await storage.remove(taskURL);
    await expect(created.rolloverCatalog()).rejects.toThrow();
    expect(await storage.load(created.rootURL)).toEqual(before);
    await created.close();
  });

  test("fallback reconstruction accepts the documented orphan-task handoff risk", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(1),
    );
    const next = await created.rolloverCatalog();
    await created.apply([
      {
        kind: "ingestTask",
        mutationID: "new-task-mutation" as VaultMutationID,
        task: {
          taskID: taskID(1),
          spec: spec("New task only named by the missing generation"),
          createdAtTimestampMillis: 2000,
          provenance: null,
        },
      },
    ]);
    expect((await created.getProjection()).tasks.size).toBe(2);
    await storage.remove(next.documentURL);
    const fallback = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(storage),
      created.rootURL,
    );
    await fallback.rolloverCatalog();
    const reopened = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(storage),
      created.rootURL,
    );
    expect((await reopened.getProjection()).tasks.size).toBe(1);
    await reopened.close();
    await fallback.close();
    await created.close();
  });
});

async function mergeDocument(
  target: AutomergeBinaryStorage,
  documentURL: AutomergeDocumentURL,
  first: AutomergeBinaryStorage,
  second: AutomergeBinaryStorage,
) {
  const a = Automerge.load((await first.load(documentURL))!);
  const b = Automerge.load((await second.load(documentURL))!);
  const merged = Automerge.merge(a, b);
  try {
    await target.save(documentURL, Automerge.save(merged));
  } finally {
    Automerge.free(merged);
    Automerge.free(b);
  }
}

class TrackingStorage implements AutomergeBinaryStorage {
  readonly loads: AutomergeDocumentURL[] = [];

  constructor(private readonly backing: AutomergeBinaryStorage) {}

  async load(documentURL: AutomergeDocumentURL) {
    this.loads.push(documentURL);
    return this.backing.load(documentURL);
  }

  save(documentURL: AutomergeDocumentURL, bytes: Uint8Array) {
    return this.backing.save(documentURL, bytes);
  }
}

class FailOnceStorage implements AutomergeBinaryStorage {
  failNextSaveTo: AutomergeDocumentURL | null = null;

  constructor(private readonly backing: AutomergeBinaryStorage) {}

  load(documentURL: AutomergeDocumentURL) {
    return this.backing.load(documentURL);
  }

  async save(documentURL: AutomergeDocumentURL, bytes: Uint8Array) {
    if (documentURL === this.failNextSaveTo) {
      this.failNextSaveTo = null;
      throw new Error("injected catalog save failure");
    }
    await this.backing.save(documentURL, bytes);
  }
}

async function cloneStorage(
  source: AutomergeBinaryStorage,
  documentURLs: AutomergeDocumentURL[],
) {
  const result = new MemoryAutomergeBinaryStorage();
  for (const documentURL of documentURLs) {
    await result.save(documentURL, (await source.load(documentURL))!);
  }
  return result;
}

function logicalVault(taskCount: number): OrbitVault {
  return {
    vaultID,
    createdAtTimestampMillis: 1_000,
    scheduler: defaultOrbitSchedulerPolicy,
    tasks: Object.fromEntries(
      Array.from({ length: taskCount }, (_, index) => [
        taskID(index),
        {
          createdAtTimestampMillis: 1_000 + index,
          spec: spec(`Prompt ${index}`),
          provenance: null,
          metadata: {},
          isDeleted: false,
        },
      ]),
    ),
    observations: {},
    attachments: {},
  };
}

function review(id: string, observation: string, timestamp: number) {
  return {
    kind: "recordReview" as const,
    mutationID: `mutation-${observation}` as VaultMutationID,
    taskID: id as TaskID,
    observationID: observation as ObservationID,
    componentID: "main",
    reviewSessionID: null,
    outcome: TaskRepetitionOutcome.Remembered,
    occurredAtTimestampMillis: timestamp,
  };
}

function spec(prompt: string) {
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Plain,
      body: { text: prompt, attachments: [] },
    },
  } as const;
}

function taskID(index: number) {
  return `task-${String(index).padStart(3, "0")}` as TaskID;
}

const testURLs = new Map<string, AutomergeDocumentURL>();

function url(seed: string) {
  const existing = testURLs.get(seed);
  if (existing) return existing;
  const generated = generateAutomergeUrl() as unknown as AutomergeDocumentURL;
  testURLs.set(seed, generated);
  return generated;
}

async function waitFor(predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for background catalog repair");
}
