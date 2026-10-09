import type {
  AttachmentID,
  ColorPaletteName,
  TaskID,
  TaskSeedInput,
} from "@withorbit/core";
import type { EmbeddedReviewSubmission } from "@withorbit/api";
import {
  EmbeddedHostEventType,
  EmbeddedScreenEventType,
  embeddedProtocolVersion,
  type EmbeddedHostAttachmentResponseEvent,
  type EmbeddedHostInitialConfigurationEvent,
  type EmbeddedHostMetadata,
  type EmbeddedHostUpdateEvent,
  type EmbeddedHostPageReviewEvent,
  type EmbeddedScreenAttachmentRequestEvent,
  type EmbeddedScreenConfiguration,
  type EmbeddedScreenRecord,
  type EmbeddedScreenReadyEvent,
  type EmbeddedScreenPageReviewEvent,
} from "@withorbit/embedded-support";
import {
  fetchEmbeddedAttachment,
  type EmbeddedAttachmentFetchDiagnostic,
} from "./attachmentFetch.js";
import { extractItems, type ExtractedEmbeddedItems } from "./extractItems.js";
import { getSharedMetadataMonitor } from "./metadataMonitor.js";

declare global {
  // supplied by the web-component build
  const EMBED_API_BASE_URL: string;
}

const embedURL = new URL(EMBED_API_BASE_URL);
const embedOrigin = embedURL.origin;

// HACK: values coupled / copy-pasta'd with styles in ReviewArea.
const gridUnit = 8;
const edgeMargin = 16;
const screenRecordsByReviewArea = new Map<
  OrbitReviewAreaElement,
  EmbeddedScreenRecord
>();
const attachmentFetches = new Map<
  AttachmentID,
  Promise<Awaited<ReturnType<typeof fetchEmbeddedAttachment>>>
>();
const pageSessionID = `embedded/${randomID()}`;
// Deliberately page-lifetime only: publisher-owned public progress is enough
// for article-wide retries and newly mounted sections. No account state lives here.
const pageReviews = new Map<string, EmbeddedReviewSubmission>();
let orderedReviewAreaElements: OrbitReviewAreaElement[] | null = [];
let embeddedHostStateIsDirty = false;
let hasAddedMessageListener = false;

function getHeightForReviewAreaOfWidth(width: number) {
  const promptWidth = Math.min(500, width - edgeMargin * 2);
  const promptHeight = Math.round((promptWidth * 5) / 6);
  return promptHeight + (7 + 11) * gridUnit;
}

function getOrderedReviewAreaElements() {
  if (orderedReviewAreaElements === null) {
    orderedReviewAreaElements = [...screenRecordsByReviewArea.keys()].sort(
      (a, b) => {
        const comparison = a.compareDocumentPosition(b);
        if (comparison & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        if (comparison & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        return 0;
      },
    );
  }
  return orderedReviewAreaElements;
}

function markEmbeddedHostStateDirty() {
  if (embeddedHostStateIsDirty) return;
  embeddedHostStateIsDirty = true;
  orderedReviewAreaElements = null;
  setTimeout(() => {
    embeddedHostStateIsDirty = false;
    const elements = getOrderedReviewAreaElements();
    const orderedScreenRecords = elements.map(
      (element) => screenRecordsByReviewArea.get(element) ?? null,
    );
    const activeAttachmentIDs = new Set(
      orderedScreenRecords.flatMap((record) => record?.attachmentIDs ?? []),
    );
    for (const attachmentID of attachmentFetches.keys()) {
      if (!activeAttachmentIDs.has(attachmentID)) {
        attachmentFetches.delete(attachmentID);
      }
    }
    elements.forEach((element, receiverIndex) => {
      const ipcNonce = element.ipcNonce;
      if (!ipcNonce) return;
      const event: EmbeddedHostUpdateEvent = {
        type: EmbeddedHostEventType.HostUpdate,
        protocolVersion: embeddedProtocolVersion,
        ipcNonce,
        state: {
          orderedScreenRecords,
          receiverIndex,
        },
      };
      element.postToFrame(event);
      // Configuration/order precedes progress so the iframe knows every task
      // it may retry, including tasks belonging to other sections.
      for (const review of pageReviews.values())
        sendPageReview(element, review);
    });
  }, 100);
}

function onMessage(event: MessageEvent) {
  if (
    event.origin !== embedOrigin ||
    !isRecord(event.data) ||
    event.data.protocolVersion !== embeddedProtocolVersion
  ) {
    return;
  }
  const element = [...screenRecordsByReviewArea.keys()].find(
    (candidate) => candidate.iframe?.contentWindow === event.source,
  );
  if (!element) return;

  if (event.data.type === EmbeddedScreenEventType.Ready) {
    const ready = event.data as unknown as EmbeddedScreenReadyEvent;
    if (!validNonce(ready.ipcNonce) || !element.acceptNonce(ready.ipcNonce)) {
      return;
    }
    const response: EmbeddedHostInitialConfigurationEvent = {
      type: EmbeddedHostEventType.InitialConfiguration,
      protocolVersion: embeddedProtocolVersion,
      ipcNonce: ready.ipcNonce,
      configuration: element.getConfiguration(),
    };
    element.postToFrame(response);
    markEmbeddedHostStateDirty();
    return;
  }

  if (event.data.ipcNonce !== element.ipcNonce) return;
  switch (event.data.type) {
    case EmbeddedScreenEventType.AttachmentRequest:
      void respondToAttachmentRequest(
        element,
        event.data as unknown as EmbeddedScreenAttachmentRequestEvent,
      );
      break;
    case EmbeddedScreenEventType.PageReview:
      receivePageReview(event.data as unknown as EmbeddedScreenPageReviewEvent);
      break;
  }
}

function addEmbeddedScreenMessageListener() {
  if (hasAddedMessageListener) return;
  window.addEventListener("message", onMessage);
  hasAddedMessageListener = true;
}

async function respondToAttachmentRequest(
  element: OrbitReviewAreaElement,
  request: EmbeddedScreenAttachmentRequestEvent,
) {
  if (
    !validRequestID(request.requestID) ||
    typeof request.attachmentID !== "string"
  ) {
    return;
  }
  const source = findAttachmentSource(request.attachmentID);
  let result: Awaited<ReturnType<typeof fetchEmbeddedAttachment>>;
  if (!source) {
    result = {
      status: "error",
      code: "not-allowlisted",
      message: "The attachment is not in the publisher's allowlist",
    };
  } else {
    result = await getAttachmentFetch(request.attachmentID, source);
  }

  const responseResult =
    result.status === "ok"
      ? { ...result, bytes: result.bytes.slice(0) }
      : result;
  const response: EmbeddedHostAttachmentResponseEvent = {
    type: EmbeddedHostEventType.AttachmentResponse,
    protocolVersion: embeddedProtocolVersion,
    ipcNonce: request.ipcNonce,
    requestID: request.requestID,
    attachmentID: request.attachmentID,
    result: responseResult,
  };
  element.postToFrame(
    response,
    responseResult.status === "ok" ? [responseResult.bytes] : [],
  );
}

function findAttachmentSource(attachmentID: AttachmentID): string | null {
  for (const element of getOrderedReviewAreaElements()) {
    const source =
      element.getExtractedItems().attachmentIDsToURLs[attachmentID];
    if (source !== undefined) return source;
  }
  return null;
}

function logAttachmentDiagnostic(value: EmbeddedAttachmentFetchDiagnostic) {
  console.info("[Orbit embed attachment]", value);
}

function getAttachmentFetch(attachmentID: AttachmentID, sourceURL: string) {
  const existing = attachmentFetches.get(attachmentID);
  if (existing) return existing;
  const pending = fetchEmbeddedAttachment({
    attachmentID,
    sourceURL,
    publisherBaseURL: document.baseURI,
    onDiagnostic: logAttachmentDiagnostic,
  }).then((result) => {
    if (
      result.status === "error" &&
      attachmentFetches.get(attachmentID) === pending
    ) {
      attachmentFetches.delete(attachmentID);
    }
    return result;
  });
  attachmentFetches.set(attachmentID, pending);
  return pending;
}

function receivePageReview(message: EmbeddedScreenPageReviewEvent) {
  const value = message.review;
  if (
    !isRecord(value) ||
    value.sessionID !== pageSessionID ||
    !validRequestID(value.requestID) ||
    typeof value.taskID !== "string" ||
    typeof value.componentID !== "string" ||
    !["remembered", "forgotten", "skipped"].includes(value.outcome) ||
    !Number.isFinite(value.occurredAtTimestampMillis) ||
    !isRecord(value.taskSeed) ||
    !Number.isFinite(value.taskSeed.createdAtTimestampMillis)
  )
    return;
  const owner = getOrderedReviewAreaElements().find((candidate) =>
    candidate
      .getScreenRecord()
      .reviewItems.some(
        (item) =>
          item.taskID === value.taskID &&
          item.componentID === value.componentID,
      ),
  );
  if (!owner || pageReviews.has(value.requestID)) return;
  // Copy only public review fields and rebuild the seed from publisher content.
  // Tokens, account-private projections and arbitrary extra properties cannot
  // accidentally be forwarded to another iframe with a review.
  const review: EmbeddedReviewSubmission = {
    requestID: value.requestID,
    sessionID: pageSessionID,
    taskID: value.taskID,
    componentID: value.componentID,
    outcome: value.outcome,
    occurredAtTimestampMillis: value.occurredAtTimestampMillis,
    taskSeed: owner.getPublicTaskSeed(
      value.taskID,
      value.taskSeed.createdAtTimestampMillis,
    ),
  };
  pageReviews.set(review.requestID, review);
  for (const receiver of getOrderedReviewAreaElements())
    sendPageReview(receiver, review);
}

function sendPageReview(
  element: OrbitReviewAreaElement,
  review: EmbeddedReviewSubmission,
) {
  if (!element.ipcNonce) return;
  const event: EmbeddedHostPageReviewEvent = {
    type: EmbeddedHostEventType.PageReview,
    protocolVersion: embeddedProtocolVersion,
    ipcNonce: element.ipcNonce,
    review,
  };
  element.postToFrame(event);
}

const iframeResizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) setIFrameSize(entry.target as HTMLIFrameElement);
});

function setIFrameSize(iframe: HTMLIFrameElement) {
  const effectiveWidth = iframe.getBoundingClientRect().width;
  iframe.style.height = `${getHeightForReviewAreaOfWidth(effectiveWidth) + 8 * 5}px`;
}

function pageIsDebug() {
  return location.search.includes("orbitDebug");
}

export class OrbitReviewAreaElement extends HTMLElement {
  private cachedMetadata: EmbeddedHostMetadata | null = null;
  private cachedItems: ExtractedEmbeddedItems | null = null;
  private shadowRootElement: ShadowRoot | null = null;
  ipcNonce: string | null = null;
  iframe: HTMLIFrameElement | null = null;

  onMetadataChange = (metadata: EmbeddedHostMetadata) => {
    this.cachedMetadata = metadata;
  };

  onChildPromptChange() {
    for (const attachmentID of this.cachedItems?.attachmentIDs ?? []) {
      attachmentFetches.delete(attachmentID);
    }
    this.cachedItems = null;
    screenRecordsByReviewArea.set(this, this.getScreenRecord());
    markEmbeddedHostStateDirty();
  }

  getExtractedItems(): ExtractedEmbeddedItems {
    this.cachedItems ??= extractItems(this);
    return this.cachedItems;
  }

  getScreenRecord(): EmbeddedScreenRecord {
    const { tasks, reviewItems, attachmentIDs } = this.getExtractedItems();
    return { tasks, reviewItems, attachmentIDs };
  }

  getConfiguration(): EmbeddedScreenConfiguration {
    if (!this.cachedMetadata || !this.ipcNonce) {
      throw new Error("Embedded review area is not ready for configuration");
    }
    const colorOverride = this.getAttribute("color") as ColorPaletteName | null;
    return {
      schemaVersion: 1,
      ...this.getScreenRecord(),
      embeddedHostMetadata: {
        ...this.cachedMetadata,
        ...(colorOverride && { colorPaletteName: colorOverride }),
      },
      sessionID: pageSessionID,
      ipcNonce: this.ipcNonce,
      isDebug: pageIsDebug() || this.hasAttribute("debug"),
    };
  }

  getPublicTaskSeed(
    taskID: TaskID,
    createdAtTimestampMillis: number,
  ): TaskSeedInput {
    const task = this.getScreenRecord().tasks.find(
      (task) => task.taskID === taskID,
    )!;
    const metadata = this.cachedMetadata!;
    return {
      taskID,
      createdAtTimestampMillis,
      spec: task.spec,
      provenance: {
        identifier: metadata.url,
        url: metadata.url,
        ...(metadata.title && { title: metadata.title }),
        ...(metadata.siteName && { containerTitle: metadata.siteName }),
        ...((this.getAttribute("color") ?? metadata.colorPaletteName) && {
          colorPaletteName: (this.getAttribute("color") ??
            metadata.colorPaletteName) as ColorPaletteName,
        }),
      },
    };
  }

  acceptNonce(value: string): boolean {
    if (this.ipcNonce !== null && this.ipcNonce !== value) return false;
    this.ipcNonce = value;
    return true;
  }

  postToFrame(message: unknown, transfer: Transferable[] = []) {
    this.iframe?.contentWindow?.postMessage(message, embedOrigin, transfer);
  }

  connectedCallback() {
    addEmbeddedScreenMessageListener();
    getSharedMetadataMonitor().addEventListener(this.onMetadataChange);
    if (!this.style.display) this.style.display = "block";
    this.shadowRootElement ??= this.attachShadow({ mode: "closed" });
    this.shadowRootElement.replaceChildren();
    this.iframe = document.createElement("iframe");
    this.iframe.style.border = "none";
    this.iframe.style.width = "100%";
    this.iframe.style.marginBottom = "1rem";
    this.iframe.setAttribute("loading", "eager");
    this.iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-popups allow-modals",
    );
    this.shadowRootElement.appendChild(this.iframe);
    iframeResizeObserver.observe(this.iframe);
    screenRecordsByReviewArea.set(this, this.getScreenRecord());
    markEmbeddedHostStateDirty();

    const iframe = this.iframe;
    requestAnimationFrame(() => {
      setIFrameSize(iframe);
      iframe.src = embedURL.href;
    });
  }

  disconnectedCallback() {
    if (this.iframe) iframeResizeObserver.unobserve(this.iframe);
    screenRecordsByReviewArea.delete(this);
    this.ipcNonce = null;
    markEmbeddedHostStateDirty();
    getSharedMetadataMonitor().removeEventListener(this.onMetadataChange);
  }
}

function validNonce(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 256 &&
    /^[0-9A-Za-z_-]+$/.test(value)
  );
}

function validRequestID(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
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
