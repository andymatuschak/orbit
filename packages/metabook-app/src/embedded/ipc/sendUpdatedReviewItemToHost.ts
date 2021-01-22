import { PromptState, PromptTaskID } from "metabook-core";
import {
  EmbeddedScreenEventType,
  EmbeddedScreenPromptStateUpdateEvent,
} from "metabook-embedded-support";

export function sendUpdatedReviewItemToHost(
  promptTaskID: PromptTaskID,
  newPromptState: PromptState,
) {
  const event: EmbeddedScreenPromptStateUpdateEvent = {
    type: EmbeddedScreenEventType.PromptStateUpdate,
    promptTaskID,
    promptState: newPromptState,
  };
  parent.postMessage(event, "*");
}
