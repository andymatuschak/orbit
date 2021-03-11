import { OrbitPromptElement } from "./OrbitPromptElement";
import { OrbitReviewAreaElement } from "./OrbitReviewAreaElement";

export { OrbitPromptElement };
export { OrbitReviewAreaElement };

window.customElements.define("orbit-reviewarea", OrbitReviewAreaElement);
window.customElements.define("orbit-prompt", OrbitPromptElement);
