import {
  EmbeddedHostMetadata,
  EmbeddedHostUpdateEvent,
  embeddedHostUpdateEventName,
  EmbeddedItem,
  EmbeddedScreenConfiguration,
  EmbeddedScreenState,
  embeddedScreenStateUpdateEventName,
  EmbeddedScreenUpdateEvent,
} from "metabook-embedded-support";
import { extractItems } from "./extractItems";
import { getSharedMetadataMonitor } from "./metadataMonitor";
import { ColorPaletteName } from "metabook-core";

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
const reviewAreaStates: Map<
  OrbitReviewAreaElement,
  EmbeddedScreenState
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

let _screenStatesNeedUpdate = false;
function markScreenStatesDirty() {
  if (!_screenStatesNeedUpdate) {
    _screenStatesNeedUpdate = true;
    requestAnimationFrame(() => {
      _screenStatesNeedUpdate = false;
      const orderedReviewAreaElements = getOrderedReviewAreaElements();

      const orderedScreenStates = orderedReviewAreaElements.map(
        (element) => reviewAreaStates.get(element) ?? null,
      );
      orderedReviewAreaElements.forEach((element, index) => {
        const event: EmbeddedHostUpdateEvent = {
          type: embeddedHostUpdateEventName,
          state: {
            orderedScreenStates,
            receiverIndex: index,
          },
        };
        element.iframe!.contentWindow!.postMessage(event, "*");
      });
    });
  }
}

function addReviewAreaElement(element: OrbitReviewAreaElement) {
  _activeReviewAreaElements.add(element);
  _orderedReviewAreaElements = null;
  markScreenStatesDirty();
}
function removeReviewAreaElement(element: OrbitReviewAreaElement) {
  _activeReviewAreaElements.delete(element);
  _orderedReviewAreaElements = null;
  markScreenStatesDirty();
}

let _hasAddedMessageListener = false;
function addEmbeddedScreenMessageListener() {
  if (_hasAddedMessageListener) {
    return;
  }
  function onMessage(event: MessageEvent) {
    if (
      EMBED_API_BASE_URL.startsWith(event.origin) &&
      event.data &&
      event.data.type === embeddedScreenStateUpdateEventName
    ) {
      const data = event.data as EmbeddedScreenUpdateEvent;
      const reviewArea = [..._activeReviewAreaElements].find(
        (element) => element.iframe?.contentWindow === event.source,
      );
      if (reviewArea) {
        // console.log("Got state update from embedded screen", reviewArea, data);
        reviewAreaStates.set(reviewArea, data.state);
        markScreenStatesDirty();
      } else {
        console.warn(
          "Ignoring state update from embedded screen with unknown review area",
        );
      }
    }
  }
  window.addEventListener("message", onMessage);
  _hasAddedMessageListener = true;
}

function pageIsDebug() {
  return location.search.includes("orbitDebug");
}

export class OrbitReviewAreaElement extends HTMLElement {
  private needsRender = false;
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
    this.iframe.setAttribute(
      "sandbox",
      "allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-modals",
    );
    shadowRoot.appendChild(this.iframe);

    const effectiveWidth = this.iframe.getBoundingClientRect().width;
    // The extra 5 grid units are for the banner.
    // TODO: encapsulate the banner's height in some API exported by metabook-app.
    this.iframe.style.height = `${
      getHeightForReviewAreaOfWidth(effectiveWidth) + 8 * 5
    }px`;

    addReviewAreaElement(this);

    const iframe = this.iframe;
    requestAnimationFrame(() => {
      if (!this.cachedMetadata) {
        throw new Error("Invariant violation: no embedded host metadata");
      }

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
