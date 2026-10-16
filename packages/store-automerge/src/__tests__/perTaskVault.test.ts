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
import { default_w } from "ts-fsrs";
import { describe, expect, spyOn, test } from "bun:test";
import type { AutomergeBinaryStorage } from "../binaryStorage.js";
import { MemoryAutomergeBinaryStorage } from "../binaryStorage.js";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { BinaryPerTaskDocuments } from "../repoPerTaskDocuments.js";
import type { PerTaskDocuments } from "@withorbit/store-shared/perTaskRepository";

const vaultID = "per-task-test-vault" as VaultID;
const fsrsNow = Date.now();

describe("per-task Automerge vault", () => {
  test("subscriber failures neither reject durable reviews nor starve other subscribers", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const repository = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      logicalVault(1),
    );
    const warning = spyOn(console, "warn").mockImplementation(() => {});
    const observerError = new Error("injected subscriber failure");
    let updates = 0;
    repository.subscribe(() => {
      throw observerError;
    });
    repository.subscribe(() => {
      updates++;
    });
    const mutation = review(taskID(0), "observed-review", 20_000);
    try {
      await repository.apply([mutation]);
      expect(updates).toBe(1);
      expect(warning).toHaveBeenCalledWith(
        "Vault subscriber failed",
        observerError,
      );
      const reopened = await PerTaskRepository.open(
        new BinaryPerTaskDocuments(storage),
        repository.rootURL,
      );
      try {
        expect(
          await reopened.readTaskObservation(taskID(0), mutation.observationID),
        ).toEqual({
          kind: "review",
          taskID: taskID(0),
          componentID: "main",
          reviewSessionID: null,
          outcome: TaskRepetitionOutcome.Remembered,
          occurredAtTimestampMillis: 20_000,
        });
        expect(await reopened.repairCatalog()).toBe(0);
      } finally {
        await reopened.close();
      }
    } finally {
      warning.mockRestore();
      await repository.close();
    }
  });

  test("unsupported scheduler policies are rejected before any document is created", async () => {
    const source = logicalVault(0);
    const storage = new MemoryAutomergeBinaryStorage();
    source.scheduler = {
      kind: "future-scheduler",
      version: 1,
    } as unknown as OrbitVault["scheduler"];
    await expect(
      PerTaskRepository.create(new BinaryPerTaskDocuments(storage), source),
    ).rejects.toThrow("supported Orbit or FSRS-6 scheduler");
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

  test("legacy catalog queue keeps its task-ID tie-breaker rather than map insertion order", async () => {
    const source = logicalVault(3);
    source.tasks = Object.fromEntries(
      Object.entries(source.tasks)
        .reverse()
        .map(([id, task]) => [
          id,
          { ...task, createdAtTimestampMillis: 1_000 },
        ]),
    );
    const repository = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(new MemoryAutomergeBinaryStorage()),
      source,
    );
    try {
      expect(
        (await repository.getReviewQueue(10_000)).map(({ task }) => task.id),
      ).toEqual([taskID(0), taskID(1), taskID(2)]);
    } finally {
      await repository.close();
    }
  });

  test("FSRS selects both lanes across the full catalog before opening only 50 task documents", async () => {
    const storage = new TrackingStorage(new MemoryAutomergeBinaryStorage());
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      fsrsBacklog(75),
    );
    const reopened = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(storage),
      created.rootURL,
    );
    try {
      storage.loads.length = 0;
      const queue = await reopened.getReviewQueue(fsrsNow, 50);
      expect(queue.map(({ task }) => task.id)).toEqual(
        Array.from({ length: 25 }, (_, index) => [
          taskID(74 - index),
          taskID(index),
        ]).flat(),
      );
      expect(storage.loads).toHaveLength(52);
      const entries = await reopened.getCatalogEntries();
      expect(
        (await reopened.getReviewWorkingSetDocumentURLs()).slice(2),
      ).toEqual(queue.map(({ task }) => entries[task.id].documentURL));
    } finally {
      await reopened.close();
      await created.close();
    }
  });

  test("FSRS alternates the first lane after each saved review, including a one-item refresh", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const repository = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      fsrsBacklog(75),
    );
    const first = async () =>
      (await repository.getReviewQueue(fsrsNow, 1))[0].task.id;
    try {
      expect(await first()).toBe(taskID(74));
      const saved = review(taskID(74), "mixed-first-review", fsrsNow);
      await repository.apply([saved]);
      expect(await first()).toBe(taskID(0));
      await repository.apply([saved]);
      expect(await first()).toBe(taskID(0));
      expect(
        (await repository.getCatalogEntries())[taskID(74)].fsrs?.reviewCount,
      ).toBe(1);
      await repository.apply([
        review(taskID(0), "mixed-second-review", fsrsNow),
      ]);
      expect(await first()).toBe(taskID(73));
      expect(
        (await repository.getCatalogEntries())[taskID(0)].fsrs?.reviewCount,
      ).toBe(1);
    } finally {
      await repository.close();
    }
  });

  test("FSRS reselects beyond a stale capped window whose saved failure is not due yet", async () => {
    const backing = new MemoryAutomergeBinaryStorage();
    const failingStorage = new FailOnceStorage(backing);
    const catalogURL = url("mixed-future-retry-stale-catalog");
    const source = fsrsBacklog(2);
    // Start the oldest lane. The later manual due observation in the fixture
    // keeps this skipped card due without inventing a successful recall.
    source.observations["earlier-skip" as ObservationID] = {
      kind: "review",
      taskID: taskID(0),
      componentID: "main",
      occurredAtTimestampMillis: fsrsNow - 20_000,
      reviewSessionID: null,
      outcome: TaskRepetitionOutcome.Skipped,
    };
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(failingStorage),
      source,
      { catalogURL },
    );
    expect((await created.getReviewQueue(fsrsNow, 1))[0].task.id).toBe(
      taskID(0),
    );
    failingStorage.failNextSaveTo = catalogURL;
    await expect(
      created.apply([
        {
          ...review(taskID(0), "saved-future-retry", fsrsNow),
          outcome: TaskRepetitionOutcome.Forgotten,
        },
      ]),
    ).rejects.toThrow("injected catalog save failure");
    const tracking = new TrackingStorage(backing);
    const reopened = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(tracking),
      created.rootURL,
    );
    try {
      tracking.loads.length = 0;
      expect(
        (await reopened.getReviewQueue(fsrsNow, 1)).map(({ task }) => task.id),
      ).toEqual([taskID(1)]);
      // Only the stale task and its newly selected successor are opened. The
      // other reads are the root/catalog refresh and catalog repair write.
      expect(
        tracking.loads.filter(
          (documentURL) =>
            documentURL !== created.rootURL && documentURL !== catalogURL,
        ),
      ).toHaveLength(2);
      const repaired = (await reopened.getCatalogEntries())[taskID(0)];
      expect(repaired.nextDueTimestampMillis).toBe(fsrsNow + 10 * 60_000);
      expect(repaired.fsrs?.memory?.isRetry).toBe(true);
      expect(repaired.fsrs?.reviewCount).toBe(2);
    } finally {
      await reopened.close();
      await created.close();
    }
  });

  test("FSRS reselects globally when repairing a saved review changes the first lane", async () => {
    const backing = new MemoryAutomergeBinaryStorage();
    const storage = new FailOnceStorage(backing);
    const catalogURL = url("mixed-stale-lane-catalog");
    const created = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      fsrsBacklog(3),
      { catalogURL },
    );
    storage.failNextSaveTo = catalogURL;
    await expect(
      created.apply([
        {
          ...review(taskID(2), "saved-lane-skip", fsrsNow - 10),
          outcome: TaskRepetitionOutcome.Skipped,
        },
        {
          kind: "reschedule",
          mutationID: "restore-old-due" as VaultMutationID,
          observationID: "restore-old-due" as ObservationID,
          taskID: taskID(2),
          componentID: "main",
          occurredAtTimestampMillis: fsrsNow,
          newDueTimestampMillis: fsrsNow - 60_000,
        },
      ]),
    ).rejects.toThrow("injected catalog save failure");
    const reopened = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(backing),
      created.rootURL,
    );
    try {
      // The stale row initially selects high-recall task 2. Its saved skip
      // changes parity but leaves it due; the correct new oldest lane starts
      // at task 0, outside that old one-item selection.
      expect(
        (await reopened.getReviewQueue(fsrsNow, 1)).map(({ task }) => task.id),
      ).toEqual([taskID(0)]);
    } finally {
      await reopened.close();
      await created.close();
    }
  });

  test("FSRS turn counts include skips and deleted rows; retries precede both lanes", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const source = fsrsBacklog(4);
    source.tasks[taskID(3)].isDeleted = true;
    source.observations["deleted-skip" as ObservationID] = {
      kind: "review",
      taskID: taskID(3),
      componentID: "main",
      occurredAtTimestampMillis: fsrsNow,
      reviewSessionID: null,
      outcome: TaskRepetitionOutcome.Skipped,
    };
    // This has no recall estimate and still participates in the oldest lane.
    delete source.observations["backlog-review-0" as ObservationID];
    const repository = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(storage),
      source,
    );
    try {
      expect(
        (await repository.getReviewQueue(fsrsNow)).map(({ task }) => task.id),
      ).toEqual([taskID(0), taskID(2), taskID(1)]);
      expect(
        (await repository.getCatalogEntries())[taskID(3)].fsrs?.reviewCount,
      ).toBe(1);
      await repository.apply([
        {
          ...review(taskID(1), "mixed-retry", fsrsNow - 11 * 60_000),
          outcome: TaskRepetitionOutcome.Forgotten,
        },
      ]);
      expect((await repository.getReviewQueue(fsrsNow, 1))[0].task.id).toBe(
        taskID(1),
      );
      expect(
        (await repository.getCatalogEntries())[taskID(1)].fsrs?.memory?.isRetry,
      ).toBe(true);
    } finally {
      await repository.close();
    }
  });

  test("FSRS metadata backfills matching task heads without changing task histories or due dates", async () => {
    const storage = new MemoryAutomergeBinaryStorage();
    const source = fsrsBacklog(3);
    const policy = source.scheduler;
    source.scheduler = defaultOrbitSchedulerPolicy;
    const documents = new BinaryPerTaskDocuments(storage);
    const repository = await PerTaskRepository.create(documents, source);
    const before = await repository.getCatalogEntries();
    const bytes = new Map(
      await Promise.all(
        Object.values(before).map(
          async (entry) =>
            [
              entry.documentURL,
              (await storage.load(entry.documentURL))!,
            ] as const,
        ),
      ),
    );
    await documents.patch(repository.rootURL, [
      { kind: "put", path: ["scheduler"], value: policy },
    ]);
    try {
      await repository.getTaskProjections([taskID(0)]);
      const opened = await repository.getCatalogEntries();
      expect(opened[taskID(0)].fsrs?.memory?.stability).toBeGreaterThan(0);
      expect(opened[taskID(1)].fsrs).toBeUndefined();
      expect(await repository.repairCatalog()).toBe(2);
      expect(await repository.repairCatalog()).toBe(0);
      const repaired = await repository.getCatalogEntries();
      for (const [id, entry] of Object.entries(before)) {
        expect(repaired[id as TaskID]).toEqual({
          ...entry,
          fsrs: expect.objectContaining({ reviewCount: 0 }),
        });
        expect(await storage.load(entry.documentURL)).toEqual(
          bytes.get(entry.documentURL),
        );
      }
      const row = repaired[taskID(1)];
      await documents.patch(repository.catalogURL, [
        {
          kind: "put",
          path: ["entries", taskID(1)],
          value: JSON.stringify({
            ...row,
            fsrs: { reviewCount: 99, memory: null },
          }),
        },
      ]);
      await repository.getTaskProjections([taskID(1)]);
      expect((await repository.getCatalogEntries())[taskID(1)]).toEqual(row);
    } finally {
      await repository.close();
    }
  });

  test("FSRS catalog memory represents the queue's chosen cloze component, not an unrelated sibling", async () => {
    const source = fsrsBacklog(1);
    source.tasks[taskID(0)].spec = {
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.Cloze,
        body: { text: "one two", attachments: [] },
        components: {
          second: { order: 0, ranges: [] },
          first: { order: 1, ranges: [] },
        },
      },
    };
    source.observations = {};
    for (const [componentID, daysAgo] of [
      ["first", 3],
      ["second", 8],
    ] as const) {
      source.observations[`review-${componentID}` as ObservationID] = {
        kind: "review",
        taskID: taskID(0),
        componentID,
        occurredAtTimestampMillis: fsrsNow - daysAgo * 86_400_000,
        reviewSessionID: null,
        outcome: TaskRepetitionOutcome.Remembered,
      };
      source.observations[`due-${componentID}` as ObservationID] = {
        kind: "reschedule",
        taskID: taskID(0),
        componentID,
        occurredAtTimestampMillis: fsrsNow - 1_000,
        newDueTimestampMillis: fsrsNow - 60_000,
      };
    }
    const repository = await PerTaskRepository.create(
      new BinaryPerTaskDocuments(new MemoryAutomergeBinaryStorage()),
      source,
    );
    try {
      const [item] = await repository.getReviewQueue(fsrsNow);
      expect(item.componentID).toBe("second");
      const memory = (await repository.getCatalogEntries())[taskID(0)].fsrs
        ?.memory;
      expect(memory?.lastReviewTimestampMillis).toBe(fsrsNow - 8 * 86_400_000);
      expect(memory?.stability).toBe(
        item.task.componentStates.second.fsrs?.stability,
      );
    } finally {
      await repository.close();
    }
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

  test.each(["orbit", "fsrs"])(
    "concurrent offline reviews converge before catalog repair (%s)",
    async (kind) => {
      const base = new MemoryAutomergeBinaryStorage();
      const rootURL = url("concurrent-root");
      const catalogURL = url("concurrent-catalog");
      const taskURL = url("concurrent-task");
      const source = logicalVault(1);
      if (kind === "fsrs")
        source.scheduler = {
          kind: "fsrs",
          version: 1,
          modelVersion: 6,
          weights: [...default_w],
          requestedRetention: 0.9,
          cutoverTimestampMillis: 0,
          previousPolicy: defaultOrbitSchedulerPolicy,
        };
      await PerTaskRepository.create(new BinaryPerTaskDocuments(base), source, {
        rootURL,
        catalogURL,
        taskURLs: { [taskID(0)]: taskURL },
      });
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
      if (kind === "fsrs") {
        const state = (await converged.getProjection()).tasks.get(taskID(0))!
          .componentStates.main;
        expect(state.fsrs?.lastReviewTimestampMillis).toBe(30_000);
        expect(state.dueTimestampMillis).toBe(30_000 + state.intervalMillis);
      }
    },
  );

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

function fsrsBacklog(taskCount: number): OrbitVault {
  const source = logicalVault(taskCount);
  source.scheduler = {
    kind: "fsrs",
    version: 1,
    modelVersion: 6,
    weights: [...default_w],
    requestedRetention: 0.9,
    cutoverTimestampMillis: fsrsNow - 86_400_000,
    previousPolicy: defaultOrbitSchedulerPolicy,
  };
  for (let index = 0; index < taskCount; index++) {
    source.observations[`backlog-review-${index}` as ObservationID] = {
      kind: "review",
      taskID: taskID(index),
      componentID: "main",
      occurredAtTimestampMillis: fsrsNow - (taskCount - index + 1) * 86_400_000,
      reviewSessionID: null,
      outcome: TaskRepetitionOutcome.Remembered,
    };
    source.observations[`backlog-reschedule-${index}` as ObservationID] = {
      kind: "reschedule",
      taskID: taskID(index),
      componentID: "main",
      occurredAtTimestampMillis: fsrsNow - 1_000,
      newDueTimestampMillis: fsrsNow - (taskCount - index) * 60_000,
    };
  }
  return source;
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
