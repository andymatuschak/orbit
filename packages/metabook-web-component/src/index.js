import { basicPromptType } from "metabook-core";
export class OrbitReviewAreaElement extends HTMLElement {
    constructor() {
        super();
        this.needsRender = false;
        this.iframe = null;
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
    render() {
        if (!this.iframe) {
            return;
        }
        const items = [];
        this.querySelectorAll(":scope > orbit-prompt").forEach((element) => {
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
        });
        const itemsParameterString = encodeURIComponent(JSON.stringify(items));
        const baseURL = new URL(EMBED_API_BASE_URL);
        baseURL.search = `i=${itemsParameterString}`;
        this.iframe.src = baseURL.href;
    }
}
export class OrbitPromptElement extends HTMLElement {
    constructor() {
        super(...arguments);
        this.mountPoint = null;
    }
    connectedCallback() {
        const reviewArea = this.getReviewAreaParent();
        if (!reviewArea) {
            throw new Error("Card without review area: " + this.outerHTML);
        }
        reviewArea.markNeedsRender();
    }
    attributeChangedCallback() {
        var _a;
        (_a = this.getReviewAreaParent()) === null || _a === void 0 ? void 0 : _a.markNeedsRender();
    }
    getReviewAreaParent() {
        let currentElement = this;
        do {
            currentElement = currentElement.parentElement;
        } while (currentElement !== null &&
            !(currentElement instanceof OrbitReviewAreaElement));
        return currentElement;
    }
    static get observedAttributes() {
        return ["question", "answer"];
    }
}
window.customElements.define("orbit-reviewarea", OrbitReviewAreaElement);
window.customElements.define("orbit-prompt", OrbitPromptElement);
//# sourceMappingURL=index.js.map