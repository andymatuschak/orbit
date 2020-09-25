import {
  EmbeddedHostMetadata,
  EmbeddedScreenConfiguration,
} from "metabook-app/src/embedded/embeddedScreenConfiguration";
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
export function getHeightForReviewAreaOfWidth(width: number) {
  // The prompt itself is 6:5, max 500px. Then we add 9 units at top (for the starburst container) and 11 at bottom (for the button bar).
  // TODO: add more at bottom if buttons stack
  const promptWidth = Math.min(500, width - edgeMargin * 2);
  const promptHeight = Math.round((promptWidth * 5) / 6);
  return promptHeight + (9 + 11) * gridUnit;
}

export class OrbitReviewAreaElement extends HTMLElement {
  private needsRender = false;
  private cachedMetadata: EmbeddedHostMetadata | null = null;
  private iframe: HTMLIFrameElement | null = null;

  onMetadataChange = (metadata: EmbeddedHostMetadata) => {
    this.cachedMetadata = metadata;
  };

  connectedCallback() {
    getSharedMetadataMonitor().addEventListener(this.onMetadataChange);

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

    this.markNeedsRender();
  }

  disconnectedCallback() {
    getSharedMetadataMonitor().removeEventListener(this.onMetadataChange);
  }

  markNeedsRender() {
    if (!this.needsRender) {
      this.needsRender = true;
      requestAnimationFrame(() => {
        this.render();
        this.needsRender = false;
      });
    }
  }

  private render() {
    if (!this.iframe) {
      return;
    }
    if (!this.cachedMetadata) {
      throw new Error("Invariant violation: no embedded host metadata");
    }

    const embeddedItems = extractItems(this);
    const colorOverride = this.getAttribute("color") as ColorPaletteName | null;

    const configuration: EmbeddedScreenConfiguration = {
      embeddedItems,
      embeddedHostMetadata: {
        ...this.cachedMetadata,
        ...(colorOverride && { colorPaletteName: colorOverride }),
      },
    };

    const itemsParameterString = encodeURIComponent(
      JSON.stringify(configuration),
    );
    const baseURL = new URL(EMBED_API_BASE_URL);
    baseURL.search = `i=${itemsParameterString}`;
    this.iframe.src = baseURL.href;
  }
}
