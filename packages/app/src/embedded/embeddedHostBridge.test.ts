import { expect, test } from "bun:test";
import type { EmbeddedReviewSubmission } from "@withorbit/api";
import {
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  type AttachmentID,
  type TaskID,
} from "@withorbit/core";
import {
  EmbeddedHostEventType,
  EmbeddedScreenEventType,
  embeddedProtocolVersion,
  type EmbeddedScreenConfiguration,
} from "@withorbit/embedded-support";
import { EmbeddedHostBridge } from "./embeddedHostBridge.js";

function fixture() {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalParent = Object.getOwnPropertyDescriptor(globalThis, "parent");
  const messages: { message: any; origin: string }[] = [];
  const host = {
    postMessage: (message: unknown, origin: string) =>
      messages.push({ message, origin }),
  };
  const browser = Object.assign(new EventTarget(), {
    origin: "https://orbit.test",
  });
  Object.defineProperty(globalThis, "window", {
    value: browser,
    configurable: true,
  });
  Object.defineProperty(globalThis, "parent", {
    value: host,
    configurable: true,
  });
  const bridge = new EmbeddedHostBridge();
  const taskID = "AAAAAAAAAAAAAAAAAAAAAA" as TaskID;
  const configuration: EmbeddedScreenConfiguration = {
    schemaVersion: 1,
    ipcNonce: bridge.ipcNonce,
    sessionID: "embedded/page-session",
    tasks: [
      {
        taskID,
        spec: {
          type: TaskSpecType.Memory,
          content: {
            type: TaskContentType.QA,
            body: { text: "Public question", attachments: [] },
            answer: { text: "Public answer", attachments: [] },
          },
        },
      },
    ],
    reviewItems: [{ taskID, componentID: "main" }],
    attachmentIDs: [],
    embeddedHostMetadata: {
      url: "https://publisher.test/article",
      title: "Article",
      siteName: null,
      colorPaletteName: null,
    },
  };
  const review: EmbeddedReviewSubmission = {
    requestID: "page-review",
    sessionID: configuration.sessionID,
    taskID,
    componentID: "main",
    outcome: TaskRepetitionOutcome.Forgotten,
    occurredAtTimestampMillis: 1234,
    taskSeed: {
      taskID,
      createdAtTimestampMillis: 1000,
      spec: configuration.tasks[0].spec,
      provenance: null,
    },
  };
  function receive(
    data: unknown,
    overrides: { source?: unknown; origin?: string } = {},
  ) {
    browser.dispatchEvent(
      Object.assign(new Event("message"), {
        data,
        source: overrides.source ?? host,
        origin: overrides.origin ?? "https://publisher.test",
      }),
    );
  }
  function message(type: string, content: Record<string, unknown>) {
    return {
      type,
      protocolVersion: embeddedProtocolVersion,
      ipcNonce: bridge.ipcNonce,
      ...content,
    };
  }
  function configure() {
    receive(
      message(EmbeddedHostEventType.InitialConfiguration, { configuration }),
    );
  }
  function dispose() {
    bridge.dispose();
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalParent)
      Object.defineProperty(globalThis, "parent", originalParent);
    else Reflect.deleteProperty(globalThis, "parent");
  }
  return {
    bridge,
    messages,
    configuration,
    review,
    receive,
    message,
    configure,
    dispose,
  };
}

test("pins the publisher boundary and replays only current page reviews once", async () => {
  const f = fixture();
  try {
    expect(f.messages[0].message.type).toBe(EmbeddedScreenEventType.Ready);
    expect(f.messages[0].origin).toBe("*");
    f.receive(
      f.message(EmbeddedHostEventType.InitialConfiguration, {
        configuration: f.configuration,
      }),
      { source: {} },
    );
    f.configure();
    expect(await f.bridge.configuration()).toEqual(f.configuration);

    const pageReview = f.message(EmbeddedHostEventType.PageReview, {
      review: f.review,
    });
    for (const invalid of [
      { ...pageReview, ipcNonce: "wrong" },
      { ...pageReview, protocolVersion: 99 },
      { ...pageReview, review: { ...f.review, sessionID: "another-page" } },
      { ...pageReview, review: { ...f.review, taskID: "private-task" } },
      { ...pageReview, review: { ...f.review, componentID: "unknown" } },
    ])
      f.receive(invalid);
    f.receive(pageReview, { origin: "https://other.test" });
    f.receive(pageReview, { source: {} });
    const observed: EmbeddedReviewSubmission[] = [];
    f.bridge.subscribeToPageReviews((review) => observed.push(review));
    expect(observed).toHaveLength(0);
    f.receive(pageReview);
    f.receive(pageReview);
    expect(observed).toEqual([f.review]);

    const replayed: EmbeddedReviewSubmission[] = [];
    const unsubscribe = f.bridge.subscribeToPageReviews((review) =>
      replayed.push(review),
    );
    expect(replayed).toEqual([f.review]);
    unsubscribe();
    f.receive(
      f.message(EmbeddedHostEventType.PageReview, {
        review: { ...f.review, requestID: "next-review" },
      }),
    );
    expect(replayed).toHaveLength(1);

    f.bridge.sendPageReview(f.review);
    expect(f.messages.at(-1)).toEqual({
      origin: "https://publisher.test",
      message: f.message(EmbeddedScreenEventType.PageReview, {
        review: f.review,
      }),
    });
    expect(
      f.messages.some(({ message }) => message.type === "vaultPortRequest"),
    ).toBe(false);
  } finally {
    f.dispose();
  }
});

test("attachment responses must match the pinned source and requested ID", async () => {
  const f = fixture();
  try {
    f.configure();
    const attachmentID = "BBBBBBBBBBBBBBBBBBBBBB" as AttachmentID;
    const pending = f.bridge.requestAttachment(attachmentID);
    const request = f.messages.at(-1)!.message;
    const response = f.message(EmbeddedHostEventType.AttachmentResponse, {
      requestID: request.requestID,
      attachmentID,
      result: {
        status: "ok",
        bytes: new Uint8Array([1, 2, 3]).buffer,
        mediaTypeHint: null,
      },
    });
    f.receive(response, { origin: "https://other.test" });
    f.receive({ ...response, attachmentID: "unknown" });
    f.receive(response);
    expect(new Uint8Array((await pending).bytes)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  } finally {
    f.dispose();
  }
});
