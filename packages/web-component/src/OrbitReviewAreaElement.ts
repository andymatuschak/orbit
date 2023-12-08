import { ColorPaletteName } from "@withorbit/core";
import {
  EmbeddedHostEventType,
  EmbeddedHostMetadata,
  EmbeddedHostUpdateEvent,
  EmbeddedScreenConfiguration,
  EmbeddedScreenEventType,
  EmbeddedScreenRecord,
  EmbeddedScreenTaskUpdateEvent,
} from "@withorbit/embedded-support";
import { extractItems } from "./extractItems.js";
import { getSharedMetadataMonitor } from "./metadataMonitor.js";

declare global {
  // supplied by Webpack
  const EMBED_API_BASE_URL: string;
}

// HACK: values coupled / copy-pasta'd with styles in ReviewArea.
const gridUnit = 8;
const edgeMargin = 16;
function getHeightForReviewAreaOfWidth(width: number) {
  // The prompt itself is 6:5, max 500px. Then we add 9 units at top (for the starburst container) and 11 at bottom (for the button bar).
  // TODO: add more at bottom if buttons stack
  const promptWidth = Math.min(500, width - edgeMargin * 2);
  const promptHeight = Math.round((promptWidth * 5) / 6);
  return promptHeight + (7 + 11) * gridUnit;
}

const screenRecordsByReviewArea: Map<
  OrbitReviewAreaElement,
  EmbeddedScreenRecord
> = new Map();

// NOTE: This invalidation strategy won't work if the review area elements are reordered after they're added to the page.
let _orderedReviewAreaElements: OrbitReviewAreaElement[] | null = [];
function getOrderedReviewAreaElements() {
  if (_orderedReviewAreaElements === null) {
    _orderedReviewAreaElements = [...screenRecordsByReviewArea.keys()].sort(
      (a, b) => {
        const comparison = a.compareDocumentPosition(b);
        if (
          (comparison & Node.DOCUMENT_POSITION_PRECEDING) ===
          Node.DOCUMENT_POSITION_PRECEDING
        ) {
          return 1;
        } else if (
          (comparison & Node.DOCUMENT_POSITION_FOLLOWING) ===
          Node.DOCUMENT_POSITION_FOLLOWING
        ) {
          return -1;
        } else {
          throw new Error(
            `Unexpected compareDocumentPosition return value ${comparison} for ${a} and ${b}`,
          );
        }
      },
    );
  }
  return _orderedReviewAreaElements;
}

let _embeddedHostStateIsDirty = false;
function markEmbeddedHostStateDirty() {
  if (!_embeddedHostStateIsDirty) {
    _embeddedHostStateIsDirty = true;
    _orderedReviewAreaElements = null;

    // Debounce by waiting a moment.
    setTimeout(() => {
      _embeddedHostStateIsDirty = false;
      const orderedReviewAreaElements = getOrderedReviewAreaElements();

      const orderedScreenRecords = orderedReviewAreaElements.map(
        (element) => screenRecordsByReviewArea.get(element) ?? null,
      );
      orderedReviewAreaElements.forEach((element, index) => {
        const event: EmbeddedHostUpdateEvent = {
          type: EmbeddedHostEventType.HostUpdate,
          state: {
            orderedScreenRecords,
            receiverIndex: index,
          },
        };
        element.iframe!.contentWindow!.postMessage(event, "*");
      });
    }, 1000);
  }
}

function onMessage(event: MessageEvent) {
  if (!EMBED_API_BASE_URL.startsWith(event.origin) || !event.data) {
    return;
  }

  function getReviewAreaEntry() {
    const reviewAreaEntry = [...screenRecordsByReviewArea.entries()].find(
      ([element]) => element.iframe?.contentWindow === event.source,
    );
    if (!reviewAreaEntry) {
      throw new Error(`Update from unknown review area ${event.source}`);
    }
    return { element: reviewAreaEntry[0], record: reviewAreaEntry[1] };
  }

  switch (event.data.type) {
    case EmbeddedScreenEventType.OnLoad:
      {
        const { element } = getReviewAreaEntry();
        const configuration = element.getConfiguration();
        element.iframe!.contentWindow!.postMessage(
          {
            type: EmbeddedHostEventType.InitialConfiguration,
            configuration,
          },
          "*",
        );
      }
      break;

    case EmbeddedScreenEventType.TaskUpdate:
      {
        const { element, record } = getReviewAreaEntry();
        const { task } = event.data as EmbeddedScreenTaskUpdateEvent;
        // May replace this with a straight lookup table if the full iteration becomes a problem, but usually N < 100.

        // Replace our record of that task with the new state.
        screenRecordsByReviewArea.set(element, {
          ...record,
          reviewItems: record.reviewItems.map((item) =>
            item.task.id === task.id ? { ...item, task } : item,
          ),
        });
        markEmbeddedHostStateDirty();
      }
      break;
  }
}

let _hasAddedMessageListener = false;
function addEmbeddedScreenMessageListener() {
  if (_hasAddedMessageListener) {
    return;
  }
  window.addEventListener("message", onMessage);
  _hasAddedMessageListener = true;
}

const iframeResizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    setIFrameSize(entry.target as HTMLIFrameElement);
  }
});

function setIFrameSize(iframe: HTMLIFrameElement) {
  const effectiveWidth = iframe.getBoundingClientRect().width;
  // The extra 5 grid units are for the banner.
  // TODO: encapsulate the banner's height in some API shared with @withorbit/app.
  iframe.style.height = `${
    getHeightForReviewAreaOfWidth(effectiveWidth) + 8 * 5
  }px`;
}

function pageIsDebug() {
  return location.search.includes("orbitDebug");
}

const sessionStartTimestampMillis = Date.now();

export class OrbitReviewAreaElement extends HTMLElement {
  private cachedMetadata: EmbeddedHostMetadata | null = null;
  private cachedRecord: EmbeddedScreenRecord | null = null;
  iframe: HTMLIFrameElement | null = null;

  onMetadataChange = (metadata: EmbeddedHostMetadata) => {
    this.cachedMetadata = metadata;
    // TODO: notify child
  };

  onChildPromptChange() {
    this.cachedRecord = null;
    // TODO: notify child
  }

  getEmbeddedItems() {
    if (this.cachedRecord === null) {
      this.cachedRecord = extractItems(this);
      screenRecordsByReviewArea.set(this, this.cachedRecord);
      markEmbeddedHostStateDirty();
    }
    return this.cachedRecord;
  }

  getConfiguration(): EmbeddedScreenConfiguration {
    if (!this.cachedMetadata) {
      throw new Error("Invariant violation: no embedded host metadata");
    }

    const colorOverride = this.getAttribute("color") as ColorPaletteName | null;
    return {
      ...this.getEmbeddedItems(),
      embeddedHostMetadata: {
        ...this.cachedMetadata,
        ...(colorOverride && { colorPaletteName: colorOverride }),
      },
      sessionStartTimestampMillis,
      isDebug: pageIsDebug() || this.hasAttribute("debug"),
    };
  }

  connectedCallback() {
    addEmbeddedScreenMessageListener();
    getSharedMetadataMonitor().addEventListener(this.onMetadataChange);

    if (!this.style.display) {
      this.style.display = "block";
    }
    const shadowRoot = this.attachShadow({ mode: "closed" });
    this.iframe = document.createElement("iframe");
    this.iframe.style.border = "none";
    this.iframe.style.width = "100%";
    this.iframe.style.marginBottom = "1rem";
    this.iframe.setAttribute("loading", "eager");
    this.iframe.setAttribute(
      "sandbox",
      "allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-modals",
    );
    shadowRoot.appendChild(this.iframe);
    iframeResizeObserver.observe(this.iframe);

    // We'll wait to actually set the iframe's contents until the next frame, since the child <orbit-prompt> elements may not yet have connected.
    const iframe = this.iframe;

    // Update global bookkeeping with our initial state-- bit of a hack.
    this.getEmbeddedItems();

    requestAnimationFrame(() => {
      setIFrameSize(iframe);
      iframe.src = EMBED_API_BASE_URL;
    });
  }

  disconnectedCallback() {
    if (this.iframe) iframeResizeObserver.unobserve(this.iframe);

    screenRecordsByReviewArea.delete(this);
    markEmbeddedHostStateDirty();

    getSharedMetadataMonitor().removeEventListener(this.onMetadataChange);
  }
}
