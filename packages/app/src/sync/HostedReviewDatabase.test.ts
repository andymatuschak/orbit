import {
  defaultOrbitSchedulerPolicy,
  type SchedulerPolicy,
  type TaskID,
  type Task,
  type VaultMutation,
  type AttachmentID,
  type AttachmentMIMEType,
  type ReviewItem,
} from "@withorbit/core";
import { expect, test } from "bun:test";
import { HostedReviewDatabase } from "./HostedReviewDatabase.js";
import type { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import type { WidgetProjectionCoordinator } from "../vault/WidgetProjectionCoordinator.js";

test("initial and concurrent fetches use one read without a startup refresh", async () => {
  const pending = deferred<ReviewItem[]>();
  const fixture = createQueue(() => pending.promise);
  const first = fixture.queue.fetch();
  expect(fixture.queue.fetch()).toBe(first);
  expect(fixture.reads).toBe(1);
  pending.resolve(items("first"));
  expect(await first).toEqual(items("first"));
  await tick();
  expect(fixture.reads).toBe(1);
  await fixture.queue.close();
});

test("a burst of changes coalesces into one read and notifies attached listeners", async () => {
  const fixture = createQueue(async () => items("latest"));
  const pushed: ReviewItem[][] = [];
  const detach = fixture.queue.subscribe((queue) => pushed.push(queue));
  fixture.change();
  fixture.change();
  fixture.change();
  await tick();
  expect(fixture.reads).toBe(1);
  expect(pushed).toEqual([items("latest")]);
  detach();
  fixture.change();
  await tick();
  expect(pushed).toHaveLength(1);
  await fixture.queue.close();
});

test("a change during an in-flight fetch forces a fresh read before notification", async () => {
  const first = deferred<ReviewItem[]>();
  const second = deferred<ReviewItem[]>();
  const fixture = createQueue((number) =>
    number === 1 ? first.promise : second.promise,
  );
  const pushed: ReviewItem[][] = [];
  fixture.queue.subscribe((queue) => pushed.push(queue));
  const fetch = fixture.queue.fetch();
  fixture.change();
  await tick();
  expect(fixture.reads).toBe(1);
  first.resolve(items("stale"));
  await Promise.resolve();
  expect(fixture.reads).toBe(2);
  expect(pushed).toEqual([]);
  second.resolve(items("fresh"));
  expect(await fetch).toEqual(items("fresh"));
  await tick();
  expect(pushed).toEqual([items("fresh")]);
  expect(fixture.reads).toBe(2);
  await fixture.queue.close();
});

test("a completed fresh fetch is reused by its pending change notification", async () => {
  const fixture = createQueue(async () => items("current"));
  const pushed: ReviewItem[][] = [];
  fixture.queue.subscribe((queue) => pushed.push(queue));
  fixture.change();
  expect(await fixture.queue.fetch()).toEqual(items("current"));
  await tick();
  expect(fixture.reads).toBe(1);
  expect(pushed).toEqual([items("current")]);
  await fixture.queue.close();
});

test("a merge during widget handoff cannot publish an older queue afterward", async () => {
  const handoff = deferred<void>();
  let flushes = 0;
  const fixture = createQueue(
    async (number) => items(String(number)),
    [],
    true,
    () => (++flushes === 1 ? handoff.promise : Promise.resolve()),
  );
  const pushed: ReviewItem[][] = [];
  fixture.queue.subscribe((queue) => pushed.push(queue));
  fixture.change();
  await tick();
  expect(flushes).toBe(1);
  expect(pushed).toEqual([]);
  fixture.change();
  handoff.resolve();
  await tick();
  expect(pushed).toEqual([items("2")]);
  await fixture.queue.close();
});

test("a change between initial fetch and UI subscription is not lost", async () => {
  const fixture = createQueue(async (number) => items(String(number)));
  expect(await fixture.queue.fetch()).toEqual(items("1"));
  fixture.change();
  const pushed: ReviewItem[][] = [];
  fixture.queue.subscribe((queue) => pushed.push(queue));
  await tick();
  expect(pushed).toEqual([items("2")]);
  await fixture.queue.close();
});

test("widget-only refresh retains the notification for a later UI subscriber without rereading", async () => {
  const fixture = createQueue(async (number) => items(String(number)));
  expect(await fixture.queue.fetch()).toEqual(items("1"));
  fixture.change();
  await tick();
  expect(fixture.reads).toBe(2);
  const pushed: ReviewItem[][] = [];
  fixture.queue.subscribe((queue) => pushed.push(queue));
  await tick();
  expect(pushed).toEqual([items("2")]);
  expect(fixture.reads).toBe(2);
  await fixture.queue.close();
});

test("browser changes with no listeners defer projection until the UI subscribes", async () => {
  const fixture = createQueue(
    async (number) => items(String(number)),
    [],
    false,
  );
  expect(await fixture.queue.fetch()).toEqual(items("1"));
  fixture.change();
  await tick();
  expect(fixture.reads).toBe(1);
  const pushed: ReviewItem[][] = [];
  fixture.queue.subscribe((queue) => pushed.push(queue));
  await tick();
  expect(pushed).toEqual([items("2")]);
  expect(fixture.reads).toBe(2);
  await fixture.queue.close();
});

test("a failed refresh reports the error and a later change can recover", async () => {
  const errors: unknown[] = [];
  const fixture = createQueue(async (number) => {
    if (number === 1) throw new Error("temporarily unavailable");
    return items("recovered");
  }, errors);
  const pushed: ReviewItem[][] = [];
  fixture.queue.subscribe((queue) => pushed.push(queue));
  fixture.change();
  await tick();
  expect(errors).toHaveLength(1);
  expect(pushed).toEqual([]);
  fixture.change();
  await tick();
  expect(pushed).toEqual([items("recovered")]);
  await fixture.queue.close();
});

test("close detaches immediately, cancels pending refresh, and rejects future operations", async () => {
  const fixture = createQueue(async () => []);
  fixture.change();
  const closing = fixture.queue.close();
  expect(fixture.queue.close()).toBe(closing);
  expect(fixture.detached).toBe(1);
  expect(() => fixture.queue.fetch()).toThrow("closed");
  expect(() => fixture.queue.subscribe(() => {})).toThrow("closed");
  fixture.change();
  await closing;
  await tick();
  expect(fixture.reads).toBe(0);
});

test("close waits for an active read but suppresses its publication and notification", async () => {
  const pending = deferred<ReviewItem[]>();
  const fixture = createQueue(() => pending.promise);
  const pushed: ReviewItem[][] = [];
  fixture.queue.subscribe((queue) => pushed.push(queue));
  fixture.change();
  await tick();
  let didClose = false;
  const closing = fixture.queue.close().then(() => {
    didClose = true;
  });
  await Promise.resolve();
  expect(didClose).toBe(false);
  pending.resolve(items("too late"));
  await closing;
  expect(pushed).toEqual([]);
  expect(fixture.published).toEqual([]);
});

function createQueue(
  read: (number: number) => Promise<ReviewItem[]>,
  errors: unknown[] = [],
  withWidget = true,
  flush = async () => {},
) {
  let listener = () => {};
  let reads = 0;
  let detached = 0;
  const published: ReviewItem[][] = [];
  const database = new HostedReviewDatabase(
    {
      getReviewQueue: () => read(++reads),
      subscribe(callback: () => void) {
        listener = callback;
        return () => {
          detached++;
        };
      },
      async apply() {},
      async readAttachment() {
        return null;
      },
      async close() {},
    } as unknown as PerTaskRepository,
    {
      debounceMillis: 0,
      widget: withWidget
        ? ({
            async publishLatest(items: ReviewItem[]) {
              published.push(items);
            },
            flush,
            async close() {},
          } as unknown as WidgetProjectionCoordinator)
        : undefined,
      async attachmentURL() {
        throw new Error("No attachment fixture");
      },
      releaseAttachmentURLs() {},
      onError: (error) => errors.push(error),
    },
  );
  const queue = {
    fetch: () => database.fetchReviewQueue(),
    subscribe: (listener: (items: ReviewItem[]) => void) =>
      database.subscribeToReviewQueue(listener),
    close: () => database.close(),
  };
  return {
    queue,
    published,
    change: () => listener(),
    get reads() {
      return reads;
    },
    get detached() {
      return detached;
    },
  };
}

function items(id: string): ReviewItem[] {
  return [{ task: { id }, componentID: "main" } as ReviewItem];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

test("attachment reads coalesce and close releases the resulting URL only after the read finishes", async () => {
  const attachment = deferred<{
    bytes: Uint8Array;
    mediaType: AttachmentMIMEType;
  }>();
  let attachmentReads = 0;
  const released: string[][] = [];
  const calls: string[] = [];
  const database = new HostedReviewDatabase(
    {
      subscribe: () => () => {},
      async getReviewQueue() {
        return [];
      },
      async apply() {},
      readAttachment() {
        attachmentReads++;
        return attachment.promise;
      },
      async close() {
        calls.push("vault closed");
      },
    } as unknown as PerTaskRepository,
    {
      async attachmentURL() {
        return "blob:attachment";
      },
      releaseAttachmentURLs(urls) {
        released.push([...urls]);
      },
      async shutdownRepo() {
        calls.push("repo closed");
      },
    },
  );
  const id = "attachment-a" as AttachmentID;
  const first = database.getURLForAttachmentID(id);
  expect(database.getURLForAttachmentID(id)).toBe(first);
  expect(attachmentReads).toBe(1);
  const closing = database.close();
  await Promise.resolve();
  expect(released).toEqual([]);
  expect(() => database.getURLForAttachmentID(id)).toThrow("closed");
  attachment.resolve({
    bytes: new Uint8Array([1]),
    mediaType: "image/png" as AttachmentMIMEType,
  });
  expect(await first).toBe("blob:attachment");
  await closing;
  expect(released).toEqual([["blob:attachment"]]);
  expect(calls).toEqual(["vault closed", "repo closed"]);
});

test("apply acknowledges the authoritative durable write, not a second receipt promise", async () => {
  const committed = deferred<void>();
  const database = new HostedReviewDatabase(
    {
      subscribe: () => () => {},
      async getReviewQueue() {
        return [];
      },
      apply: () => committed.promise,
      async readAttachment() {
        return null;
      },
      async close() {},
    } as unknown as PerTaskRepository,
    {
      async attachmentURL() {
        throw new Error("unused");
      },
      releaseAttachmentURLs() {},
    },
  );
  let acknowledged = false;
  const applying = database.apply([]).then(() => {
    acknowledged = true;
  });
  await Promise.resolve();
  expect(acknowledged).toBe(false);
  committed.resolve();
  await applying;
  expect(acknowledged).toBe(true);
  await database.close();
});

test("forwards the live scheduler and projects a saved task even after it leaves the due queue", async () => {
  let scheduler: SchedulerPolicy = defaultOrbitSchedulerPolicy;
  const taskID = "saved-task" as TaskID;
  const task = { id: taskID } as Task;
  const requested: (readonly TaskID[])[] = [];
  const database = new HostedReviewDatabase(
    {
      get scheduler() {
        return scheduler;
      },
      async getTaskProjections(taskIDs: readonly TaskID[]) {
        requested.push(taskIDs);
        return { tasks: new Map([[taskID, task]]) };
      },
      getReviewQueue: async () => [],
      subscribe: () => () => {},
      apply: async () => {},
      readAttachment: async () => null,
      close: async () => {},
    },
    {
      attachmentURL: async () => "unused",
      releaseAttachmentURLs() {},
    },
  );
  expect(database.scheduler).toBe(scheduler);
  scheduler = { ...defaultOrbitSchedulerPolicy, intervalGrowthFactor: 3 };
  expect(database.scheduler).toBe(scheduler);
  expect((await database.getTaskProjections([taskID])).tasks.get(taskID)).toBe(
    task,
  );
  expect(requested).toEqual([[taskID]]);
  await database.close();
  expect(() => database.getTaskProjections([taskID])).toThrow("closed");
});

test("a post-save projection failure does not change the completed durable-write result", async () => {
  const saved: (readonly VaultMutation[])[] = [];
  const database = new HostedReviewDatabase(
    {
      scheduler: defaultOrbitSchedulerPolicy,
      getTaskProjections: async () => {
        throw new Error("projection unavailable");
      },
      getReviewQueue: async () => [],
      subscribe: () => () => {},
      apply: async (mutations) => {
        saved.push([...mutations]);
      },
      readAttachment: async () => null,
      close: async () => {},
    },
    {
      attachmentURL: async () => "unused",
      releaseAttachmentURLs() {},
    },
  );
  await database.apply([]);
  await expect(
    database.getTaskProjections(["saved-task" as TaskID]),
  ).rejects.toThrow("projection unavailable");
  expect(saved).toEqual([[]]);
  await database.close();
});
