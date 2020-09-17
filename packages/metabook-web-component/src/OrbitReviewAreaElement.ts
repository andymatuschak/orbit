import { getHeightForReviewAreaOfWidth } from "metabook-ui";
import { extractItems } from "./extractItems";
import { getSharedMetadataMonitor, PageMetadata } from "./metadataMonitor";

declare global {
  // supplied by Webpack
  const EMBED_API_BASE_URL: string;
}

export class OrbitReviewAreaElement extends HTMLElement {
  private needsRender = false;
  private iframe: HTMLIFrameElement | null = null;

  constructor() {
    super();
  }

  onMetadataChange = (metadata: PageMetadata) => {
    console.log("new metadata", metadata);
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

    const items = extractItems(this);

    const itemsParameterString = encodeURIComponent(JSON.stringify(items));
    const baseURL = new URL(EMBED_API_BASE_URL);
    baseURL.search = `i=${itemsParameterString}`;
    this.iframe.src = baseURL.href;
  }
}
