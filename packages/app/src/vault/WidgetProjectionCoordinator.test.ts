import {
  TaskRepetitionOutcome,
  type ObservationID,
  type ReviewItem,
  type TaskID,
  type VaultID,
  type VaultMutation,
  type VaultMutationID,
} from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import type {
  WidgetProjectionBridge,
  WidgetReviewOutboxRecord,
} from "./widgetProjection.js";
import { WidgetProjectionCoordinator } from "./WidgetProjectionCoordinator.js";

const vaultID = "vault-test" as VaultID;
const observationID = "review/0000000000000000000000" as ObservationID;
const mutationID = "review/0000000000000000000000" as VaultMutationID;
const taskID = "task-a" as TaskID;

describe("widget projection coordinator", () => {
  test.each(["empty outbox read", "acknowledgement"])(
    "preserves a publication queued during an awaited %s",
    async (phase) => {
      const publications: (readonly ReviewItem[])[] = [];
      const bridge = fakeBridge([], []);
      let started!: () => void;
      const blocked = new Promise<void>((resolve) => {
        started = resolve;
      });
      let finish!: () => void;
      const released = new Promise<void>((resolve) => {
        finish = resolve;
      });
      bridge.readPendingReviews = async () => {
        if (phase === "empty outbox read") {
          started();
          await released;
          return [];
        }
        return [reviewRecord()];
      };
      bridge.markReviewsImported = async () => {
        started();
        await released;
      };
      bridge.replaceProjection = async ({ reviewItems }) => {
        publications.push(reviewItems);
      };
      const coordinator = new WidgetProjectionCoordinator(vaultID, bridge);
      const latest = [
        { task: { id: "latest" }, componentID: "main" },
      ] as ReviewItem[];
      const importing = coordinator.importPendingReviews(
        async () => {},
        async () => [],
      );
      await blocked;
      const publishing = coordinator.publishLatest(latest);
      finish();
      await Promise.all([importing, publishing]);
      expect(publications).toEqual([latest]);
      await coordinator.close();
    },
  );

  test("an empty foreground import preserves a queued fresh projection", async () => {
    const publications: (readonly ReviewItem[])[] = [];
    const bridge = fakeBridge([], []);
    bridge.replaceProjection = async ({ reviewItems }) => {
      publications.push(reviewItems);
    };
    const coordinator = new WidgetProjectionCoordinator(vaultID, bridge);
    const latest = [
      { task: { id: "latest" }, componentID: "main" },
    ] as ReviewItem[];

    const importing = coordinator.importPendingReviews(
      async () => {
        throw new Error("Empty import must not apply");
      },
      async () => {
        throw new Error("Empty import must not read the queue");
      },
    );
    await Promise.all([importing, coordinator.publishLatest(latest)]);
    expect(publications).toEqual([latest]);
    await coordinator.close();
  });

  test("a publication arriving during the fresh import read is not discarded", async () => {
    const publications: (readonly ReviewItem[])[] = [];
    const bridge = fakeBridge([reviewRecord()], []);
    let started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: (items: ReviewItem[]) => void;
    const fresh = new Promise<ReviewItem[]>((resolve) => {
      finish = resolve;
    });
    bridge.markReviewsImported = async ({ reviewItems }) => {
      publications.push(reviewItems);
    };
    bridge.replaceProjection = async ({ reviewItems }) => {
      publications.push(reviewItems);
    };
    const coordinator = new WidgetProjectionCoordinator(vaultID, bridge);
    const imported = [
      { task: { id: "after-import" }, componentID: "main" },
    ] as ReviewItem[];
    const latest = [
      { task: { id: "after-another-review" }, componentID: "main" },
    ] as ReviewItem[];
    const importing = coordinator.importPendingReviews(
      async () => {},
      () => {
        started();
        return fresh;
      },
    );
    await reading;
    const publishing = coordinator.publishLatest(latest);
    finish(imported);
    await Promise.all([importing, publishing]);
    expect(publications).toEqual([imported, latest]);
    await coordinator.close();
  });

  test("close finishes the active import and skips queued resumes", async () => {
    const calls: string[] = [];
    const coordinator = new WidgetProjectionCoordinator(
      vaultID,
      fakeBridge([reviewRecord()], calls),
    );
    let release!: () => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const importReviews = () =>
      coordinator.importPendingReviews(
        async () => {
          calls.push("apply");
          started();
          await blocked;
        },
        async () => [],
      );
    const active = importReviews();
    await began;
    const queued = importReviews();
    const closing = coordinator.close();
    let secondCloseFinished = false;
    const secondClosing = coordinator.close().then(() => {
      secondCloseFinished = true;
    });
    await Promise.resolve();
    expect(secondCloseFinished).toBe(false);
    release();
    expect(await active).toBe(1);
    expect(await queued).toBe(0);
    await closing;
    await secondClosing;
    expect(calls).toEqual(["read", "apply", "mark"]);
  });

  test("imports the durable outbox before acknowledging it", async () => {
    const calls: string[] = [];
    const bridge = fakeBridge([reviewRecord()], calls);
    const coordinator = new WidgetProjectionCoordinator(vaultID, bridge);
    let applied: readonly VaultMutation[] = [];

    expect(
      await coordinator.importPendingReviews(
        async (mutations) => {
          calls.push("apply");
          applied = mutations;
        },
        async () => [],
      ),
    ).toBe(1);

    expect(applied).toEqual([
      {
        kind: "recordReview",
        mutationID,
        observationID,
        taskID,
        componentID: "main",
        reviewSessionID: "WIDGET",
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis: 10,
      },
    ]);
    expect(calls).toEqual(["read", "apply", "mark"]);
  });

  test("leaves the outbox pending when the authoritative write fails", async () => {
    const calls: string[] = [];
    const coordinator = new WidgetProjectionCoordinator(
      vaultID,
      fakeBridge([reviewRecord()], calls),
    );

    await expect(
      coordinator.importPendingReviews(
        async () => {
          calls.push("apply");
          throw new Error("write failed");
        },
        async () => [],
      ),
    ).rejects.toThrow("write failed");
    expect(calls).toEqual(["read", "apply"]);
  });

  test("publishes a stable projection revision", async () => {
    const revisions: string[] = [];
    const bridge = fakeBridge([], []);
    bridge.replaceProjection = async ({ revision }) => {
      revisions.push(revision);
    };
    const coordinator = new WidgetProjectionCoordinator(vaultID, bridge);

    await coordinator.publishLatest([]);
    await coordinator.publishLatest([]);

    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toBe(revisions[1]);
    expect(revisions[0]).toHaveLength(64);
  });

  test("projection revisions preserve queue order, including import acknowledgement", async () => {
    const revisions: string[] = [];
    const publications: (readonly ReviewItem[])[] = [];
    const bridge = fakeBridge([reviewRecord()], []);
    bridge.replaceProjection = async ({ revision, reviewItems }) => {
      revisions.push(revision);
      publications.push(reviewItems);
    };
    bridge.markReviewsImported = async ({ revision, reviewItems }) => {
      revisions.push(revision);
      publications.push(reviewItems);
    };
    const coordinator = new WidgetProjectionCoordinator(vaultID, bridge);
    const first = { task: { id: "task-z" }, componentID: "main" } as ReviewItem;
    const second = {
      task: { id: "task-b" },
      componentID: "main",
    } as ReviewItem;
    const ordered = [first, second];
    const reversed = [second, first];

    await coordinator.publishLatest(ordered);
    await coordinator.publishLatest(ordered);
    await coordinator.publishLatest(reversed);
    await coordinator.importPendingReviews(
      async () => {},
      async () => ordered,
    );

    expect(publications).toEqual([ordered, ordered, reversed, ordered]);
    expect(revisions[0]).toBe(revisions[1]);
    expect(revisions[2]).not.toBe(revisions[0]);
    expect(revisions[3]).toBe(revisions[0]);
  });

  test("commits a fresh queue with acknowledgement and discards snapshots captured during import", async () => {
    const calls: string[] = [];
    const bridge = fakeBridge([reviewRecord()], calls);
    const publications: (readonly ReviewItem[])[] = [];
    let acknowledge!: Parameters<
      WidgetProjectionBridge["markReviewsImported"]
    >[0];
    bridge.replaceProjection = async ({ reviewItems }) => {
      publications.push(reviewItems);
    };
    bridge.markReviewsImported = async (input) => {
      acknowledge = input;
      calls.push("ack");
    };
    const coordinator = new WidgetProjectionCoordinator(vaultID, bridge);
    let releaseApply!: () => void;
    let applyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      applyStarted = resolve;
    });
    const applying = new Promise<void>((resolve) => {
      releaseApply = resolve;
    });
    const importing = coordinator.importPendingReviews(
      async () => {
        calls.push("apply");
        applyStarted();
        await applying;
      },
      async () => {
        calls.push("fresh");
        return [];
      },
    );
    await started;
    const stalePublication = coordinator.publishLatest([
      { task: { id: "already-reviewed" }, componentID: "main" } as ReviewItem,
    ]);
    releaseApply();
    await importing;
    await stalePublication;
    expect(calls).toEqual(["read", "apply", "fresh", "ack"]);
    expect(acknowledge.reviewItems).toEqual([]);
    expect(acknowledge.observationIDs).toEqual([observationID]);
    expect(acknowledge.revision).toHaveLength(64);
    expect(publications).toEqual([]);
  });

  test("does not acknowledge when fresh queue derivation fails", async () => {
    const calls: string[] = [];
    const coordinator = new WidgetProjectionCoordinator(
      vaultID,
      fakeBridge([reviewRecord()], calls),
    );
    await expect(
      coordinator.importPendingReviews(
        async () => {
          calls.push("apply");
        },
        async () => {
          throw new Error("queue failed");
        },
      ),
    ).rejects.toThrow("queue failed");
    expect(calls).toEqual(["read", "apply"]);
  });

  test("replays the same stable mutation after an acknowledgement failure", async () => {
    const bridge = fakeBridge([reviewRecord()], []);
    let attempts = 0;
    bridge.markReviewsImported = async () => {
      if (++attempts === 1) throw new Error("handoff unavailable");
    };
    const coordinator = new WidgetProjectionCoordinator(vaultID, bridge);
    const appliedIDs: string[] = [];
    const apply = async (mutations: readonly VaultMutation[]) => {
      appliedIDs.push(mutations[0]!.mutationID);
    };
    await expect(
      coordinator.importPendingReviews(apply, async () => []),
    ).rejects.toThrow("handoff unavailable");
    await coordinator.importPendingReviews(apply, async () => []);
    expect(appliedIDs).toEqual([mutationID, mutationID]);
  });

  test("serializes writes and skips superseded queue snapshots", async () => {
    const publishedTaskIDs: string[] = [];
    let releaseFirstWrite!: () => void;
    let firstWriteStarted!: () => void;
    const firstWriteDidStart = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const firstWriteMayFinish = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const bridge = fakeBridge([], []);
    bridge.replaceProjection = async ({ reviewItems }) => {
      publishedTaskIDs.push(String(reviewItems[0]?.task.id));
      if (publishedTaskIDs.length === 1) {
        firstWriteStarted();
        await firstWriteMayFinish;
      }
    };
    const coordinator = new WidgetProjectionCoordinator(vaultID, bridge);
    const reviewItem = (id: string) =>
      ({ task: { id }, componentID: "main" }) as unknown as ReviewItem;

    void coordinator.publishLatest([reviewItem("old")]);
    await firstWriteDidStart;
    void coordinator.publishLatest([reviewItem("superseded")]);
    const latest = coordinator.publishLatest([reviewItem("latest")]);
    releaseFirstWrite();
    await latest;

    expect(publishedTaskIDs).toEqual(["old", "latest"]);
  });

  test("drains the latest queued projection when closing", async () => {
    const publishedTaskIDs: string[] = [];
    let releaseFirstWrite!: () => void;
    let firstWriteStarted!: () => void;
    const firstWriteDidStart = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const firstWriteMayFinish = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const bridge = fakeBridge([], []);
    bridge.replaceProjection = async ({ reviewItems }) => {
      publishedTaskIDs.push(String(reviewItems[0]?.task.id));
      if (publishedTaskIDs.length === 1) {
        firstWriteStarted();
        await firstWriteMayFinish;
      }
    };
    const coordinator = new WidgetProjectionCoordinator(vaultID, bridge);
    const reviewItem = (id: string) =>
      ({ task: { id }, componentID: "main" }) as unknown as ReviewItem;

    void coordinator.publishLatest([reviewItem("old")]);
    await firstWriteDidStart;
    void coordinator.publishLatest([reviewItem("latest")]);
    const close = coordinator.close();
    releaseFirstWrite();
    await close;

    expect(publishedTaskIDs).toEqual(["old", "latest"]);
    await coordinator.publishLatest([reviewItem("after-close")]);
    expect(publishedTaskIDs).toEqual(["old", "latest"]);
  });
});

function reviewRecord(): WidgetReviewOutboxRecord {
  return {
    mutationID,
    observationID,
    taskID,
    componentID: "main",
    outcome: TaskRepetitionOutcome.Remembered,
    occurredAtTimestampMillis: 10,
  };
}

function fakeBridge(
  records: WidgetReviewOutboxRecord[],
  calls: string[],
): WidgetProjectionBridge {
  return {
    async readPendingReviews() {
      calls.push("read");
      return records;
    },
    async markReviewsImported() {
      calls.push("mark");
    },
    async replaceProjection() {
      calls.push("replace");
    },
  };
}
