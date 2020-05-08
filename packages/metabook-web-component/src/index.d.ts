declare global {
    const EMBED_API_BASE_URL: string;
}
export declare class OrbitReviewAreaElement extends HTMLElement {
    private needsRender;
    private iframe;
    constructor();
    connectedCallback(): void;
    markNeedsRender(): void;
    private render;
}
export declare class OrbitPromptElement extends HTMLElement {
    private mountPoint;
    connectedCallback(): void;
    attributeChangedCallback(): void;
    private getReviewAreaParent;
    static get observedAttributes(): string[];
}
//# sourceMappingURL=index.d.ts.map