import { basicPromptType, Prompt, PromptParameters } from "metabook-core";

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
    shadowRoot.appendChild(this.iframe);

    this.markNeedsRender();
  }

  markNeedsRender() {
    if (!this.needsRender) {
      this.needsRender = true;
      // TODO cancel on disconnect
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

    // TODO de-dupe with embedded-app
    interface EmbeddedItem {
      prompt: Prompt;
      promptParameters: PromptParameters;
    }

    const items: EmbeddedItem[] = [];
    this.querySelectorAll<OrbitPromptElement>(":scope > orbit-prompt").forEach(
      (element) => {
        items.push({
          prompt: {
            promptType: basicPromptType,
            question: {
              contents: element.getAttribute("question") || "<missing>",
              attachments: [],
            },
            answer: {
              contents: element.getAttribute("answer") || "<missing>",
              attachments: [],
            },
            explanation: null,
          },
          promptParameters: null,
        });
      },
    );

    const itemsParameterString = encodeURIComponent(JSON.stringify(items));
    const baseURL = new URL(EMBED_API_BASE_URL);
    baseURL.search = `i=${itemsParameterString}`;
    this.iframe.src = baseURL.href;
  }
}

export class OrbitPromptElement extends HTMLElement {
  private mountPoint: HTMLElement | null = null;

  connectedCallback() {
    const reviewArea = this.getReviewAreaParent();
    if (!reviewArea) {
      throw new Error("Card without review area: " + this.outerHTML);
    }
    reviewArea.markNeedsRender();
  }

  attributeChangedCallback() {
    this.getReviewAreaParent()?.markNeedsRender();
  }

  private getReviewAreaParent(): OrbitReviewAreaElement | null {
    let currentElement: HTMLElement | null = this;
    do {
      currentElement = currentElement.parentElement;
    } while (
      currentElement !== null &&
      !(currentElement instanceof OrbitReviewAreaElement)
    );
    return currentElement;
  }

  static get observedAttributes() {
    return ["question", "answer"];
  }
}

window.customElements.define("orbit-reviewarea", OrbitReviewAreaElement);
window.customElements.define("orbit-prompt", OrbitPromptElement);
