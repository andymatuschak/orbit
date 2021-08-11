import { Task } from "@withorbit/core2";
import {
  EmbeddedScreenEventType,
  EmbeddedScreenTaskUpdateEvent,
} from "@withorbit/embedded-support";

export function sendUpdatedReviewItemToHost(task: Task) {
  const event: EmbeddedScreenTaskUpdateEvent = {
    type: EmbeddedScreenEventType.TaskUpdate,
    task,
  };
  parent.postMessage(event, "*");
}
