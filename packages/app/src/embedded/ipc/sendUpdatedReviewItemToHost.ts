import { PromptState, PromptTaskID } from "@withorbit/core";
import {
  EmbeddedScreenEventType,
  EmbeddedScreenPromptStateUpdateEvent,
} from "@withorbit/embedded-support";

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
