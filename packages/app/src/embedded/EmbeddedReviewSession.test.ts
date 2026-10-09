import { expect, test } from "bun:test";
import {
  eventReducer,
  EventType,
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  generateUniqueID,
  type EventID,
  type Task,
  type TaskID,
  type TaskRepetitionEvent,
  type TaskSeedInput,
} from "@withorbit/core";
import type {
  EmbeddedReviewBatch,
  EmbeddedReviewSubmission,
} from "@withorbit/api";
import {
  EmbeddedReviewSession,
  taskFromSeed,
  type EmbeddedReviewAPI,
} from "./EmbeddedReviewSession.js";

const first = seed();
const second = seed();

test("anonymous progress is page-only; attachments are deferred until sign-in", async () => {
  const fixture = apiFixture();
  let preparations = 0;
  const session = new EmbeddedReviewSession({
    sessionID: "page",
    api: fixture.api,
    now: () => 100,
    prepareTask: async () => {
      preparations++;
      return [];
    },
  });
  session.registerSection([first]);
  await session.mark(first.taskID, "main", TaskRepetitionOutcome.Forgotten);
  session.registerSection([second]);
  expect(
    session.tasks()[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBe(100);
  expect(fixture.saves).toHaveLength(0);
  expect(preparations).toBe(0);
  const reopened = new EmbeddedReviewSession({
    sessionID: "new-page",
    api: fixture.api,
  });
  expect(
    reopened.registerSection([first])[0].componentStates.main
      .lastRepetitionTimestampMillis,
  ).toBeNull();
  await session.selectAccount("andy");
  await session.refresh();
  expect(preparations).toBe(1);
  expect(fixture.saves).toHaveLength(1);
  expect(session.pendingCount()).toBe(0);
});

test("publisher relay deduplicates progress across iframe seed timestamps", async () => {
  const fixture = apiFixture();
  const one = new EmbeddedReviewSession({
    sessionID: "page",
    api: fixture.api,
    now: () => 100,
  });
  const two = new EmbeddedReviewSession({
    sessionID: "page",
    api: fixture.api,
  });
  one.registerSection([first, second]);
  two.registerSection([{ ...first, createdAtTimestampMillis: 42 }, second]);
  const result = await one.mark(
    first.taskID,
    "main",
    TaskRepetitionOutcome.Forgotten,
  );
  two.receivePageReview(result.pageReview!);
  two.receivePageReview(result.pageReview!);
  expect(two.pendingCount()).toBe(1);
  expect(
    two.tasks()[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBe(100);
  expect(two.tasks()[0].componentStates.main.intervalMillis).toBe(
    one.tasks()[0].componentStates.main.intervalMillis,
  );
  await one.selectAccount("andy");
  await two.selectAccount("andy");
  expect(fixture.reviews.get("andy")?.size).toBe(1);
  expect(fixture.saves[1].batch.reviews[0]).toEqual(
    fixture.saves[0].batch.reviews[0],
  );
});

test("signed-in marks wait for ACK and retry a lost response without duplication", async () => {
  const fixture = apiFixture();
  const session = new EmbeddedReviewSession({
    sessionID: "page",
    api: fixture.api,
    now: () => 100,
  });
  session.registerSection([first]);
  await session.selectAccount("andy");
  fixture.loseResponse = true;
  await expect(
    session.mark(first.taskID, "main", TaskRepetitionOutcome.Remembered),
  ).rejects.toThrow("Lost response");
  expect(
    session.tasks()[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBeNull();
  expect(session.pendingCount()).toBe(1);
  const result = await session.mark(
    first.taskID,
    "main",
    TaskRepetitionOutcome.Remembered,
  );
  expect(result.persistence).toBe("server");
  expect(result.task.componentStates.main.lastRepetitionTimestampMillis).toBe(
    100,
  );
  expect(fixture.reviews.get("andy")?.size).toBe(1);
  expect(fixture.saves[0].batch.reviews[0].requestID).toBe(
    fixture.saves[1].batch.reviews[0].requestID,
  );
  expect(fixture.saves[0].batch.reviews[0].requestID).toMatch(
    /^[0-9A-Za-z_-]{22}$/,
  );
});

test("failed anonymous sign-in pins work to that account, not the next account", async () => {
  const fixture = apiFixture();
  const session = new EmbeddedReviewSession({
    sessionID: "page",
    api: fixture.api,
    now: () => 100,
  });
  session.registerSection([first]);
  await session.mark(first.taskID, "main", TaskRepetitionOutcome.Remembered);
  fixture.loseResponse = true;
  await expect(session.selectAccount("andy")).rejects.toThrow("Lost response");
  await session.selectAccount("other");
  expect(fixture.reviews.get("other")).toBeUndefined();
  expect(
    session.tasks()[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBeNull();
  await session.selectAccount("andy");
  expect(session.pendingCount()).toBe(0);
  expect(fixture.reviews.get("andy")?.size).toBe(1);
});

test("a new account render cannot borrow a previously confirmed account's collection", async () => {
  const fixture = apiFixture();
  const session = new EmbeddedReviewSession({
    sessionID: "page",
    api: fixture.api,
    now: () => 100,
  });
  session.registerSection([first]);
  await session.selectAccount("andy");
  await session.mark(first.taskID, "main", TaskRepetitionOutcome.Remembered);
  expect(
    session.tasks()[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBe(100);
  expect(
    session.tasks("other")[0].componentStates.main
      .lastRepetitionTimestampMillis,
  ).toBeNull();
  expect(
    session.tasks(null)[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBeNull();
  await session.selectAccount("other");
  expect(
    session.tasks()[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBeNull();
});

test("account switch during upload cannot advance another account", async () => {
  const fixture = apiFixture();
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const session = new EmbeddedReviewSession({
    sessionID: "page",
    api: {
      ...fixture.api,
      save: async (accountID, batch) => {
        const response = await fixture.api.save(accountID, batch);
        started.resolve();
        await finish.promise;
        return response;
      },
    },
  });
  session.registerSection([first]);
  await session.selectAccount("andy");
  const mark = session.mark(
    first.taskID,
    "main",
    TaskRepetitionOutcome.Remembered,
  );
  await started.promise;
  await session.selectAccount("other");
  finish.resolve();
  await expect(mark).rejects.toThrow("Account changed");
  expect(
    session.tasks()[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBeNull();
  expect(fixture.saves[0].accountID).toBe("andy");
});

test("late reads cannot overwrite a newer ACK or another account", async () => {
  const fixture = apiFixture();
  let deferred = false;
  const started = Promise.withResolvers<void>();
  const read = Promise.withResolvers<{ tasks: Task[] }>();
  const session = new EmbeddedReviewSession({
    sessionID: "page",
    now: () => 100,
    api: {
      ...fixture.api,
      read: async (accountID, ids) => {
        if (!deferred) return fixture.api.read(accountID, ids);
        started.resolve();
        return read.promise;
      },
    },
  });
  session.registerSection([first]);
  await session.selectAccount("andy");
  deferred = true;
  const stale = session.refresh();
  await started.promise;
  await session.mark(first.taskID, "main", TaskRepetitionOutcome.Remembered);
  read.resolve({ tasks: [taskFromSeed(first)] });
  await stale;
  expect(
    session.tasks()[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBe(100);
  const old = session.refresh();
  deferred = false;
  await session.selectAccount("other");
  await old;
  expect(
    session.tasks()[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBeNull();
});

test("conflicting retries and partial acknowledgements keep unsaved work", async () => {
  const fixture = apiFixture();
  const session = new EmbeddedReviewSession({
    sessionID: "page",
    api: {
      ...fixture.api,
      save: async () => ({ tasks: [], acceptedRequestIDs: [] }),
    },
  });
  session.registerSection([first]);
  await session.selectAccount("andy");
  const id = generateUniqueID();
  await expect(
    session.mark(first.taskID, "main", TaskRepetitionOutcome.Remembered, id),
  ).rejects.toThrow("acknowledge");
  await expect(
    session.mark(first.taskID, "main", TaskRepetitionOutcome.Forgotten, id),
  ).rejects.toThrow("changed content");
  expect(session.pendingCount()).toBe(1);
});

function seed(): TaskSeedInput {
  return {
    taskID: generateUniqueID() as TaskID,
    createdAtTimestampMillis: 1,
    provenance: null,
    spec: {
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.QA,
        body: { text: "Prompt", attachments: [] },
        answer: { text: "Answer", attachments: [] },
      },
    },
  };
}

function apiFixture() {
  const states = new Map<string, Map<TaskID, Task>>();
  const reviews = new Map<string, Map<string, EmbeddedReviewSubmission>>();
  const saves: { accountID: string; batch: EmbeddedReviewBatch }[] = [];
  const fixture = {
    loseResponse: false,
    saves,
    reviews,
    api: {
      async read(accountID: string, taskIDs: TaskID[]) {
        return {
          tasks: taskIDs.flatMap((id) => {
            const task = states.get(accountID)?.get(id);
            return task ? [task] : [];
          }),
        };
      },
      async save(accountID: string, batch: EmbeddedReviewBatch) {
        saves.push({ accountID, batch });
        const tasks = states.get(accountID) ?? new Map<TaskID, Task>();
        const accepted =
          reviews.get(accountID) ?? new Map<string, EmbeddedReviewSubmission>();
        states.set(accountID, tasks);
        reviews.set(accountID, accepted);
        for (const review of batch.reviews) {
          if (accepted.has(review.requestID)) continue;
          accepted.set(review.requestID, review);
          const task =
            tasks.get(review.taskID) ?? taskFromSeed(review.taskSeed);
          tasks.set(
            review.taskID,
            eventReducer<TaskRepetitionEvent>(task, {
              id: review.requestID as EventID,
              entityID: review.taskID,
              type: EventType.TaskRepetition,
              timestampMillis: review.occurredAtTimestampMillis,
              componentID: review.componentID,
              outcome: review.outcome,
              reviewSessionID: review.sessionID,
            }),
          );
        }
        if (fixture.loseResponse) {
          fixture.loseResponse = false;
          throw new Error("Lost response");
        }
        return {
          tasks: [...tasks.values()],
          acceptedRequestIDs: batch.reviews.map((review) => review.requestID),
        };
      },
    } satisfies EmbeddedReviewAPI,
  };
  return fixture;
}
