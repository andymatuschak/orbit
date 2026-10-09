import { expect, test } from "bun:test";
import type { EmbeddedReviewSubmission } from "@withorbit/api";
import {
  EmbeddedHostEventType,
  EmbeddedScreenEventType,
  embeddedProtocolVersion,
  type EmbeddedScreenConfiguration,
} from "@withorbit/embedded-support";
import { TaskRepetitionOutcome } from "@withorbit/core";

// The production bundle substitutes this value at build time.
Object.assign(globalThis, { EMBED_API_BASE_URL: "https://orbit.test/embed" });
const { OrbitReviewAreaElement } = await import("./OrbitReviewAreaElement.js");
customElements.define("orbit-reviewarea-test", OrbitReviewAreaElement);

test("relays and replays page-only public progress without eagerly fetching attachments", async () => {
  document.head.innerHTML = "<title>Public article</title>";
  const originalFetch = globalThis.fetch;
  // Keep the real iframe window/source, but do not navigate to a remote app in
  // this protocol unit test. The browser smoke exercises actual navigation.
  const originalAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  let fetchCount = 0;
  globalThis.fetch = (() => {
    fetchCount++;
    throw new Error("Unexpected eager attachment fetch");
  }) as unknown as typeof fetch;
  const elements: InstanceType<typeof OrbitReviewAreaElement>[] = [];
  function section(question: string) {
    const element = document.createElement(
      "orbit-reviewarea-test",
    ) as InstanceType<typeof OrbitReviewAreaElement>;
    element.innerHTML = `<orbit-prompt question="${question}" answer="Public answer" question-attachments="https://publisher.test/image.png"></orbit-prompt>`;
    document.body.appendChild(element);
    elements.push(element);
    const messages: any[] = [];
    element.postToFrame = (message) => {
      messages.push(message);
    };
    return { element, messages };
  }
  function send(
    frame: ReturnType<typeof section>,
    data: unknown,
    override: Partial<MessageEventInit> = {},
  ) {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://orbit.test",
        source: frame.element.iframe!.contentWindow,
        data,
        ...override,
      }),
    );
  }
  function ready(frame: ReturnType<typeof section>, ipcNonce: string) {
    send(frame, {
      type: EmbeddedScreenEventType.Ready,
      protocolVersion: embeddedProtocolVersion,
      ipcNonce,
    });
    return frame.messages.find(
      (message) => message.type === EmbeddedHostEventType.InitialConfiguration,
    )?.configuration as EmbeddedScreenConfiguration;
  }
  const first = section("First public question");
  const second = section("Second public question");
  try {
    // Only a known Orbit iframe may claim its nonce-bearing bootstrap.
    send(
      first,
      { type: "ready", protocolVersion: 1, ipcNonce: "wrong-source-nonce" },
      { source: window },
    );
    expect(first.messages).toHaveLength(0);
    const configuration = ready(first, "first-frame-nonce-value");
    ready(second, "second-frame-nonce-value");
    expect(configuration.sessionID).toStartWith("embedded/");
    await Bun.sleep(120);
    expect(fetchCount).toBe(0);

    const taskID = configuration.tasks[0].taskID;
    const review: EmbeddedReviewSubmission = {
      requestID: "transient-review",
      sessionID: configuration.sessionID,
      taskID,
      componentID: "main",
      outcome: TaskRepetitionOutcome.Forgotten,
      occurredAtTimestampMillis: 2345,
      taskSeed: first.element.getPublicTaskSeed(taskID, 1234),
    };
    const message = {
      type: EmbeddedScreenEventType.PageReview,
      protocolVersion: 1,
      ipcNonce: first.element.ipcNonce,
      review,
    };
    const reviews = () =>
      second.messages.filter(
        (message) => message.type === EmbeddedHostEventType.PageReview,
      );
    for (const invalid of [
      { ...message, ipcNonce: "wrong" },
      { ...message, protocolVersion: 99 },
      { ...message, review: { ...review, sessionID: "other-page" } },
      { ...message, review: { ...review, taskID: "private-account-task" } },
    ])
      send(first, invalid);
    send(first, message, { origin: "https://imposter.test" });
    expect(reviews()).toHaveLength(0);

    send(first, {
      ...message,
      review: {
        ...review,
        token: "never-relay-this",
        taskSeed: {
          ...review.taskSeed,
          metadata: { secret: "private" },
          spec: { private: "account-content" },
        },
      },
    });
    send(first, message);
    expect(reviews()).toHaveLength(1);
    expect(reviews()[0].review).toEqual(review);
    expect(JSON.stringify(reviews()[0])).not.toContain("private");
    expect(JSON.stringify(reviews()[0])).not.toContain("token");
    expect(reviews()[0].ipcNonce).toBe(second.element.ipcNonce);

    const late = section("First public question");
    ready(late, "late-frame-nonce-value");
    await Bun.sleep(120);
    const replay = late.messages.find(
      (message) => message.type === EmbeddedHostEventType.PageReview,
    );
    expect(replay.review).toEqual(review);
    expect(
      late.messages.findIndex(
        (message) => message.type === EmbeddedHostEventType.HostUpdate,
      ),
    ).toBeLessThan(
      late.messages.findIndex(
        (message) => message.type === EmbeddedHostEventType.PageReview,
      ),
    );
    expect(fetchCount).toBe(0);
  } finally {
    elements.forEach((element) => element.remove());
    globalThis.fetch = originalFetch;
    globalThis.requestAnimationFrame = originalAnimationFrame;
  }
});
