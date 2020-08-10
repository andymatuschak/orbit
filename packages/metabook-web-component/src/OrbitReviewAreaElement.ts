import { extractItems } from "./extractItems";

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

  connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: "closed" });
    this.iframe = document.createElement("iframe");
    this.iframe.style.border = "none";
    this.iframe.style.width = "100%";
    this.iframe.style.height = "600px";
    this.iframe.style.marginBottom = "1rem";
    this.iframe.setAttribute(
      "sandbox",
      "allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups",
    );
    shadowRoot.appendChild(this.iframe);

    this.markNeedsRender();
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
