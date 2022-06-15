import { Task } from "@withorbit/core";
import {
  EmbeddedScreenEventType,
  EmbeddedScreenTaskUpdateEvent,
} from "@withorbit/embedded-support";

export function sendUpdatedReviewItemToHost(
  task: Task,
  queueLength: number,
  newQueueIndex: number,
) {
  const event: EmbeddedScreenTaskUpdateEvent = {
    type: EmbeddedScreenEventType.TaskUpdate,
    task,
    queueLength,
    queueIndex: newQueueIndex,
  };
  parent.postMessage(event, "*");
}
