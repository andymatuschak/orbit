import { OrbitPromptElement } from "./OrbitPromptElement.js";
import { OrbitReviewAreaElement } from "./OrbitReviewAreaElement.js";

export { OrbitPromptElement };
export { OrbitReviewAreaElement };

window.customElements.define("orbit-reviewarea", OrbitReviewAreaElement);
window.customElements.define("orbit-prompt", OrbitPromptElement);
