import { expect, test } from "bun:test";
import {
  AttachmentMIMEType,
  EventType,
  eventReducer,
  generateUniqueID,
  TaskContentType,
  TaskSpecType,
  TaskRepetitionOutcome,
  type AttachmentID,
  type Event,
  type EventID,
  type Task,
  type TaskID,
  type TaskSeedInput,
} from "@withorbit/core";
import type { EmbeddedReviewBatch } from "@withorbit/api";
import type { AuthenticationClient } from "../authentication/index.js";
import { EmbeddedReviewSession } from "./EmbeddedReviewSession.js";
import { createEmbeddedReviewAPI } from "./embeddedReviewAPI.js";

const taskSeed: TaskSeedInput = {
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

test("hosted selection uses ID-token HTTP, no client root/account in the body", async () => {
  const fixture = transportFixture();
  const api = fixture.client({ hostedSyncEnabled: true });
  await api.read("andy", [taskSeed.taskID]);
  const batch = reviewBatch();
  await api.save("andy", batch);
  expect(fixture.calls.map((call) => call.path)).toEqual([
    "/v1/hosted-roots:resolve",
    "/v1/embedded/projections",
    "/v1/embedded/reviews",
  ]);
  for (const call of fixture.calls)
    expect(call.headers.get("Authorization")).toBe("ID andy-token");
  expect(fixture.calls[1].body).toEqual({ taskIDs: [taskSeed.taskID] });
  expect(fixture.calls[2].body).toEqual({ ...batch, attachments: [] });
});

test("the hosted resolver does not bind a fetch callback to its client object", async () => {
  const auth = {
    getUserAuthState: async () => ({ userID: "andy", emailAddress: null }),
    getCurrentIDToken: async () => "token",
  } as AuthenticationClient;
  let requests = 0;
  const api = createEmbeddedReviewAPI(auth, {
    hostedSyncEnabled: true,
    hostedAccountIDs: [],
    serviceOrigin: "https://sync.test",
    fetch: function (this: unknown, input: string | URL | Request) {
      expect(this).toBeUndefined();
      requests++;
      return Promise.resolve(
        String(input).endsWith("/v1/hosted-roots:resolve")
          ? Response.json({
              accountID: "andy",
              rootDocumentURL: "automerge:root",
            })
          : Response.json({ tasks: [] }),
      );
    } as unknown as typeof fetch,
  });
  await api.read("andy", [taskSeed.taskID]);
  expect(requests).toBe(2);
});

test("legacy accounts use the same session and stable events after a lost response", async () => {
  const fixture = transportFixture();
  fixture.legacy = true;
  const api = fixture.client({ hostedSyncEnabled: true });
  const session = new EmbeddedReviewSession({
    sessionID: "page",
    api,
    now: () => 100,
  });
  session.registerSection([taskSeed]);
  await session.selectAccount("andy");
  fixture.loseResponse = true;
  await expect(
    session.mark(taskSeed.taskID, "main", TaskRepetitionOutcome.Remembered),
  ).rejects.toThrow("Lost response");
  expect(
    session.tasks()[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBeNull();
  await session.mark(taskSeed.taskID, "main", TaskRepetitionOutcome.Remembered);
  expect(fixture.events.size).toBe(2);
  const writes = fixture.calls.filter((call) => call.path === "/api/events");
  expect(writes[0].body).toEqual(writes[1].body);
  for (const event of fixture.events.values())
    expect(event.id).toMatch(/^[0-9A-Za-z_-]{22}$/);
  expect(
    session.tasks()[0].componentStates.main.lastRepetitionTimestampMillis,
  ).toBe(100);
});

test("accounts outside the hosted cohort do not contact the sync server", async () => {
  const fixture = transportFixture();
  await fixture
    .client({ hostedSyncEnabled: true, hostedAccountIDs: ["other"] })
    .read("andy", [taskSeed.taskID]);
  expect(fixture.calls.map((call) => call.path)).toEqual([
    "/api/tasks/bulkGet",
  ]);
});

test("auth change while obtaining a token prevents any account write", async () => {
  const fixture = transportFixture();
  fixture.switchDuringToken = true;
  await expect(
    fixture.client({ hostedSyncEnabled: false }).save("andy", reviewBatch()),
  ).rejects.toThrow("Account changed");
  expect(fixture.calls).toHaveLength(0);
});

test("hosted task reads and review batches are bounded to100 items", async () => {
  const fixture = transportFixture();
  const api = fixture.client({ hostedSyncEnabled: true });
  const taskIDs = Array.from(
    { length: 201 },
    () => generateUniqueID() as TaskID,
  );
  await api.read("andy", taskIDs);
  const batch = reviewBatch();
  batch.reviews = taskIDs.map((taskID) => ({
    ...batch.reviews[0],
    requestID: generateUniqueID(),
    taskID,
    taskSeed: { ...taskSeed, taskID },
  }));
  const result = await api.save("andy", batch);
  expect(
    fixture.calls
      .filter((call) => call.path.endsWith("/projections"))
      .map((call) => call.body.taskIDs.length),
  ).toEqual([100, 100, 1]);
  expect(
    fixture.calls
      .filter((call) => call.path.endsWith("/reviews"))
      .map((call) => call.body.reviews.length),
  ).toEqual([100, 100, 1]);
  expect(result.acceptedRequestIDs).toHaveLength(201);
});

test("legacy images are uploaded as bytes before the event acknowledgement", async () => {
  const fixture = transportFixture();
  const batch = reviewBatch();
  batch.attachments = [
    {
      attachmentID:
        generateUniqueID() as import("@withorbit/core").AttachmentID,
      mediaTypeHint: AttachmentMIMEType.PNG,
      bytesBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
    },
  ];
  await fixture.client({ hostedSyncEnabled: false }).save("andy", batch);
  const upload = fixture.calls.findIndex((call) =>
    call.path.includes("/attachments/"),
  );
  const events = fixture.calls.findIndex((call) => call.path === "/api/events");
  expect(upload).toBeGreaterThanOrEqual(0);
  expect(upload).toBeLessThan(events);
  expect(
    [...fixture.events.values()].some(
      (event) => event.type === EventType.AttachmentIngest,
    ),
  ).toBe(true);
});

test("hosted batches split on unique attachment bytes, not just review count", async () => {
  const fixture = transportFixture();
  const batch = reviewBatch();
  const firstImage = generateUniqueID() as AttachmentID;
  const secondImage = generateUniqueID() as AttachmentID;
  batch.attachments = [firstImage, secondImage].map((attachmentID) => ({
    attachmentID,
    bytesBase64: "A".repeat(8 * 1024 * 1024),
  }));
  batch.reviews = [firstImage, firstImage, secondImage].map((attachmentID) => {
    const taskID = generateUniqueID() as TaskID;
    return {
      ...batch.reviews[0],
      requestID: generateUniqueID(),
      taskID,
      taskSeed: {
        ...taskSeed,
        taskID,
        spec: {
          ...taskSeed.spec,
          content: {
            ...taskSeed.spec.content,
            body: { text: "Prompt", attachments: [attachmentID] },
          },
        },
      },
    };
  });
  const result = await fixture
    .client({ hostedSyncEnabled: true })
    .save("andy", batch);
  const writes = fixture.calls.filter((call) => call.path.endsWith("/reviews"));
  expect(writes.map((call) => call.body.reviews.length)).toEqual([2, 1]);
  expect(writes.map((call) => call.body.attachments.length)).toEqual([1, 1]);
  expect(result.acceptedRequestIDs).toHaveLength(3);
});

function reviewBatch(): EmbeddedReviewBatch {
  return {
    reviews: [
      {
        requestID: generateUniqueID(),
        sessionID: "page",
        taskID: taskSeed.taskID,
        componentID: "main",
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis: 100,
        taskSeed,
      },
    ],
  };
}

function transportFixture() {
  let userID = "andy";
  const calls: { path: string; headers: Headers; body: any }[] = [];
  const events = new Map<EventID, Event>();
  const tasks = new Map<TaskID, Task>();
  const fixture = {
    calls,
    events,
    legacy: false,
    loseResponse: false,
    switchDuringToken: false,
    client(options: Parameters<typeof createEmbeddedReviewAPI>[1]) {
      const auth = {
        getUserAuthState: async () => ({ userID, emailAddress: null }),
        getCurrentIDToken: async () => {
          if (fixture.switchDuringToken) userID = "other";
          return "andy-token";
        },
      } as AuthenticationClient;
      const fetchImplementation = (async (
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        const path = new URL(String(input)).pathname;
        const body =
          typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
        calls.push({ path, headers: new Headers(init?.headers), body });
        if (path === "/v1/hosted-roots:resolve")
          return fixture.legacy
            ? Response.json({ error: "legacy-account" }, { status: 409 })
            : Response.json({
                accountID: "hosted-andy",
                rootDocumentURL: "automerge:root",
              });
        if (path === "/v1/embedded/projections")
          return Response.json({ tasks: [] });
        if (path === "/v1/embedded/reviews")
          return Response.json({
            tasks: [],
            acceptedRequestIDs: body.reviews.map(
              (review: { requestID: string }) => review.requestID,
            ),
          });
        if (path.includes("/attachments/"))
          return new Response(null, { status: 204 });
        if (path === "/api/events") {
          for (const event of body as Event[]) {
            if (events.has(event.id)) continue;
            events.set(event.id, event);
            if (
              event.type === EventType.TaskIngest ||
              event.type === EventType.TaskRepetition
            ) {
              const previous = tasks.get(event.entityID) ?? null;
              tasks.set(event.entityID, eventReducer(previous, event));
            }
          }
          if (fixture.loseResponse) {
            fixture.loseResponse = false;
            throw new Error("Lost response");
          }
          return new Response(null, { status: 204 });
        }
        if (path === "/api/tasks/bulkGet")
          return Response.json({
            type: "list",
            hasMore: false,
            items: body.flatMap((id: TaskID) =>
              tasks.has(id) ? [tasks.get(id)] : [],
            ),
          });
        throw new Error(`Unexpected request ${path}`);
      }) as unknown as typeof fetch;
      return createEmbeddedReviewAPI(auth, {
        serviceOrigin: "https://sync.test",
        legacyOrigin: "https://legacy.test/api",
        ...options,
        fetch: fetchImplementation,
      });
    },
  };
  return fixture;
}
