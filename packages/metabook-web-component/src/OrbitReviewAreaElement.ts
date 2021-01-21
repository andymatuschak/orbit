import { ColorPaletteName } from "metabook-core";
import {
  EmbeddedHostEventType,
  EmbeddedHostMetadata,
  EmbeddedHostUpdateEvent,
  EmbeddedItem,
  EmbeddedScreenConfiguration,
  EmbeddedScreenEventType,
  EmbeddedScreenPromptStateUpdateEvent,
  EmbeddedScreenRecord,
  EmbeddedScreenRecordResolvedEvent,
} from "metabook-embedded-support";
import { extractItems } from "./extractItems";
import { getSharedMetadataMonitor } from "./metadataMonitor";

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

const _activeReviewAreaElements: Set<OrbitReviewAreaElement> = new Set();
const screenRecordsByReviewArea: Map<
  OrbitReviewAreaElement,
  EmbeddedScreenRecord
> = new Map();

// NOTE: This invalidation strategy won't work if the review area elements are reordered after they're added to the page.
let _orderedReviewAreaElements: OrbitReviewAreaElement[] | null = [];
function getOrderedReviewAreaElements() {
  if (_orderedReviewAreaElements === null) {
    _orderedReviewAreaElements = [..._activeReviewAreaElements].sort((a, b) => {
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
    });
  }
  return _orderedReviewAreaElements;
}

let _embeddedHostStateIsDirty = false;
function markEmbeddedHostStateDirty() {
  if (!_embeddedHostStateIsDirty) {
    _embeddedHostStateIsDirty = true;

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

function addReviewAreaElement(element: OrbitReviewAreaElement) {
  _activeReviewAreaElements.add(element);
  _orderedReviewAreaElements = null;
  markEmbeddedHostStateDirty();
}
function removeReviewAreaElement(element: OrbitReviewAreaElement) {
  _activeReviewAreaElements.delete(element);
  _orderedReviewAreaElements = null;
  markEmbeddedHostStateDirty();
}

function onMessage(event: MessageEvent) {
  if (!EMBED_API_BASE_URL.startsWith(event.origin) || !event.data) {
    return;
  }

  switch (event.data.type) {
    case EmbeddedScreenEventType.ScreenRecordResolved:
      const recordUpdate = event.data as EmbeddedScreenRecordResolvedEvent;
      const reviewArea = [..._activeReviewAreaElements].find(
        (element) => element.iframe?.contentWindow === event.source,
      );
      if (reviewArea) {
        // console.log("Got state update from embedded screen", reviewArea, recordUpdate);
        screenRecordsByReviewArea.set(reviewArea, recordUpdate.record);
        markEmbeddedHostStateDirty();
      } else {
        console.warn(
          "Ignoring state update from embedded screen with unknown review area",
        );
      }
      break;

    case EmbeddedScreenEventType.PromptStateUpdate:
      const {
        promptTaskID,
        promptState,
      } = event.data as EmbeddedScreenPromptStateUpdateEvent;
      // May replace this with a straight lookup table if the full iteration becomes a problem, but usually N < 100.
      for (const screenRecord of screenRecordsByReviewArea.values()) {
        for (const reviewItem of screenRecord.reviewItems) {
          if (reviewItem.promptTaskID === promptTaskID) {
            reviewItem.promptState = promptState;
          }
        }
      }
      markEmbeddedHostStateDirty();
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

function pageIsDebug() {
  return location.search.includes("orbitDebug");
}

export class OrbitReviewAreaElement extends HTMLElement {
  private cachedMetadata: EmbeddedHostMetadata | null = null;
  private cachedItems: EmbeddedItem[] | null = null;
  iframe: HTMLIFrameElement | null = null;

  onMetadataChange = (metadata: EmbeddedHostMetadata) => {
    this.cachedMetadata = metadata;
    // TODO: notify child
  };

  onChildPromptChange() {
    this.cachedItems = null;
    // TODO: notify child
  }

  getEmbeddedItems() {
    if (this.cachedItems === null) {
      this.cachedItems = extractItems(this);
    }
    return this.cachedItems;
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
    addReviewAreaElement(this);

    // We'll wait to actually set the iframe's contents until the next frame, since the child <orbit-prompt> elements may not yet have connected.
    const iframe = this.iframe;
    requestAnimationFrame(() => {
      if (!this.cachedMetadata) {
        throw new Error("Invariant violation: no embedded host metadata");
      }

      const effectiveWidth = iframe.getBoundingClientRect().width;
      // The extra 5 grid units are for the banner.
      // TODO: encapsulate the banner's height in some API exported by metabook-app.
      iframe.style.height = `${
        getHeightForReviewAreaOfWidth(effectiveWidth) + 8 * 5
      }px`;

      const colorOverride = this.getAttribute(
        "color",
      ) as ColorPaletteName | null;

      const configuration: EmbeddedScreenConfiguration = {
        embeddedItems: this.getEmbeddedItems(),
        embeddedHostMetadata: {
          ...this.cachedMetadata,
          ...(colorOverride && { colorPaletteName: colorOverride }),
        },
        isDebug: pageIsDebug() || this.hasAttribute("debug"),
      };

      const itemsParameterString = encodeURIComponent(
        JSON.stringify(configuration),
      );
      const baseURL = new URL(EMBED_API_BASE_URL);
      baseURL.search = `i=${itemsParameterString}`;
      iframe.src = baseURL.href;
    });
  }

  disconnectedCallback() {
    removeReviewAreaElement(this);
    getSharedMetadataMonitor().removeEventListener(this.onMetadataChange);
  }
}
