import type { AttachmentID } from "@withorbit/core";
import type { EmbeddedReviewSubmission } from "@withorbit/api";
import {
  EmbeddedHostEventType,
  EmbeddedScreenEventType,
  embeddedProtocolVersion,
  type EmbeddedAttachmentResponseResult,
  type EmbeddedHostAttachmentResponseEvent,
  type EmbeddedHostInitialConfigurationEvent,
  type EmbeddedHostState,
  type EmbeddedHostUpdateEvent,
  type EmbeddedHostPageReviewEvent,
  type EmbeddedScreenAttachmentRequestEvent,
  type EmbeddedScreenConfiguration,
  type EmbeddedScreenReadyEvent,
  type EmbeddedScreenPageReviewEvent,
} from "@withorbit/embedded-support";

type HostStateListener = (state: EmbeddedHostState) => void;
type PageReviewListener = (review: EmbeddedReviewSubmission) => void;

interface PendingAttachment {
  attachmentID: AttachmentID;
  resolve: (
    result: Extract<EmbeddedAttachmentResponseResult, { status: "ok" }>,
  ) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Owns the security boundary between an embedded Orbit iframe and its publisher.
 * The first nonce-bearing reply pins the publisher origin; every later message
 * must match source, origin, protocol version, and nonce.
 */
export class EmbeddedHostBridge {
  readonly ipcNonce: string;
  private parentOrigin: string | null = null;
  private configurationValue: EmbeddedScreenConfiguration | null = null;
  private readonly configurationPromise: Promise<EmbeddedScreenConfiguration>;
  private resolveConfiguration!: (value: EmbeddedScreenConfiguration) => void;
  private rejectConfiguration!: (error: Error) => void;
  private readonly hostStateListeners = new Set<HostStateListener>();
  private hostStateValue: EmbeddedHostState | null = null;
  private readonly pageReviewListeners = new Set<PageReviewListener>();
  private readonly pageReviews = new Map<string, EmbeddedReviewSubmission>();
  private readonly pendingAttachments = new Map<string, PendingAttachment>();

  constructor(configurationFromURL: EmbeddedScreenConfiguration | null = null) {
    this.ipcNonce = validNonce(configurationFromURL?.ipcNonce)
      ? configurationFromURL.ipcNonce
      : randomID();
    this.configurationPromise = new Promise((resolve, reject) => {
      this.resolveConfiguration = resolve;
      this.rejectConfiguration = reject;
    });
    window.addEventListener("message", this.onMessage);

    if (configurationFromURL) {
      const configuration = {
        ...configurationFromURL,
        schemaVersion: 1 as const,
        ipcNonce: this.ipcNonce,
      };
      assertConfiguration(configuration, this.ipcNonce);
      this.parentOrigin = window.origin;
      this.configurationValue = configuration;
      this.resolveConfiguration(configuration);
    } else {
      const event: EmbeddedScreenReadyEvent = {
        type: EmbeddedScreenEventType.Ready,
        protocolVersion: embeddedProtocolVersion,
        ipcNonce: this.ipcNonce,
      };
      // The iframe cannot know its publisher's origin until this reply. The
      // random nonce makes the one wildcard bootstrap response correlatable.
      parent.postMessage(event, "*");
    }
  }

  configuration(): Promise<EmbeddedScreenConfiguration> {
    return this.configurationPromise;
  }

  subscribeToHostState(listener: HostStateListener): () => void {
    this.hostStateListeners.add(listener);
    if (this.hostStateValue) listener(this.hostStateValue);
    return () => this.hostStateListeners.delete(listener);
  }

  subscribeToPageReviews(listener: PageReviewListener): () => void {
    this.pageReviewListeners.add(listener);
    for (const review of this.pageReviews.values()) listener(review);
    return () => this.pageReviewListeners.delete(listener);
  }

  sendPageReview(review: EmbeddedReviewSubmission): void {
    const event: EmbeddedScreenPageReviewEvent = {
      type: EmbeddedScreenEventType.PageReview,
      protocolVersion: embeddedProtocolVersion,
      ipcNonce: this.ipcNonce,
      review,
    };
    this.postToParent(event);
  }

  requestAttachment(
    attachmentID: AttachmentID,
    timeoutMillis = 20_000,
  ): Promise<Extract<EmbeddedAttachmentResponseResult, { status: "ok" }>> {
    const requestID = randomID();
    const result = new Promise<
      Extract<EmbeddedAttachmentResponseResult, { status: "ok" }>
    >((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAttachments.delete(requestID);
        reject(new Error("Attachment handoff timed out"));
      }, timeoutMillis);
      this.pendingAttachments.set(requestID, {
        attachmentID,
        resolve,
        reject,
        timeout,
      });
    });
    const event: EmbeddedScreenAttachmentRequestEvent = {
      type: EmbeddedScreenEventType.AttachmentRequest,
      protocolVersion: embeddedProtocolVersion,
      ipcNonce: this.ipcNonce,
      requestID,
      attachmentID,
    };
    this.postToParent(event);
    return result;
  }

  dispose(): void {
    window.removeEventListener("message", this.onMessage);
    const error = new Error("Embedded host bridge was closed");
    for (const pending of this.pendingAttachments.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingAttachments.clear();
    this.hostStateListeners.clear();
    this.pageReviewListeners.clear();
    this.pageReviews.clear();
  }

  private readonly onMessage = (event: MessageEvent) => {
    if (event.source !== parent || !isRecord(event.data)) return;
    if (event.data.protocolVersion !== embeddedProtocolVersion) return;

    if (event.data.type === EmbeddedHostEventType.InitialConfiguration) {
      if (this.configurationValue !== null || this.parentOrigin !== null)
        return;
      const message =
        event.data as unknown as EmbeddedHostInitialConfigurationEvent;
      if (
        message.ipcNonce !== this.ipcNonce ||
        message.configuration?.ipcNonce !== this.ipcNonce
      ) {
        return;
      }
      try {
        assertConfiguration(message.configuration, this.ipcNonce);
      } catch (error) {
        this.rejectConfiguration(asError(error));
        return;
      }
      this.parentOrigin = event.origin;
      this.configurationValue = message.configuration;
      this.resolveConfiguration(message.configuration);
      return;
    }

    if (
      this.parentOrigin === null ||
      event.origin !== this.parentOrigin ||
      event.data.ipcNonce !== this.ipcNonce
    ) {
      return;
    }

    switch (event.data.type) {
      case EmbeddedHostEventType.HostUpdate: {
        const message = event.data as unknown as EmbeddedHostUpdateEvent;
        if (!validHostState(message.state)) return;
        this.hostStateValue = message.state;
        for (const listener of this.hostStateListeners) listener(message.state);
        return;
      }
      case EmbeddedHostEventType.AttachmentResponse:
        this.receiveAttachment(
          event.data as unknown as EmbeddedHostAttachmentResponseEvent,
        );
        return;
      case EmbeddedHostEventType.PageReview:
        this.receivePageReview(
          event.data as unknown as EmbeddedHostPageReviewEvent,
        );
        return;
    }
  };

  private receiveAttachment(message: EmbeddedHostAttachmentResponseEvent) {
    const pending = this.pendingAttachments.get(message.requestID);
    if (!pending || pending.attachmentID !== message.attachmentID) return;
    this.pendingAttachments.delete(message.requestID);
    clearTimeout(pending.timeout);
    if (
      message.result.status === "ok" &&
      message.result.bytes instanceof ArrayBuffer
    ) {
      pending.resolve(message.result);
    } else if (message.result.status === "error") {
      pending.reject(new Error(message.result.message));
    } else {
      pending.reject(new Error("Publisher returned a malformed attachment"));
    }
  }

  private receivePageReview(message: EmbeddedHostPageReviewEvent) {
    const review = message.review;
    if (
      !isRecord(review) ||
      review.sessionID !== this.configurationValue?.sessionID ||
      typeof review.requestID !== "string" ||
      review.requestID.length === 0 ||
      review.requestID.length > 256 ||
      typeof review.taskID !== "string" ||
      typeof review.componentID !== "string" ||
      !Number.isFinite(review.occurredAtTimestampMillis) ||
      !["remembered", "forgotten", "skipped"].includes(review.outcome) ||
      !isRecord(review.taskSeed) ||
      review.taskSeed.taskID !== review.taskID ||
      !Number.isFinite(review.taskSeed.createdAtTimestampMillis)
    )
      return;
    const records = this.hostStateValue?.orderedScreenRecords ?? [
      this.configurationValue,
    ];
    if (
      !records.some((record) =>
        record?.reviewItems.some(
          (item) =>
            item.taskID === review.taskID &&
            item.componentID === review.componentID,
        ),
      )
    )
      return;
    if (this.pageReviews.has(review.requestID)) return;
    this.pageReviews.set(review.requestID, review);
    for (const listener of this.pageReviewListeners) listener(review);
  }

  private postToParent(message: unknown) {
    if (this.parentOrigin === null) {
      throw new Error("Publisher origin is not pinned yet");
    }
    parent.postMessage(message, this.parentOrigin);
  }
}

function assertConfiguration(
  value: unknown,
  expectedNonce: string,
): asserts value is EmbeddedScreenConfiguration {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.ipcNonce !== expectedNonce ||
    typeof value.sessionID !== "string" ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.reviewItems) ||
    !Array.isArray(value.attachmentIDs) ||
    !isRecord(value.embeddedHostMetadata)
  ) {
    throw new Error("Publisher returned an invalid embed configuration");
  }
}

function validHostState(value: unknown): value is EmbeddedHostState {
  return (
    isRecord(value) &&
    Array.isArray(value.orderedScreenRecords) &&
    Number.isSafeInteger(value.receiverIndex)
  );
}

function validNonce(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 256 &&
    /^[0-9A-Za-z_-]+$/.test(value)
  );
}

function randomID(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
