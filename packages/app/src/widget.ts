import {
  createReviewQueue,
  EntityType,
  EventType,
  generateUniqueID,
  getReviewQueueFuzzyDueTimestampThreshold,
  ReviewItem,
  Task,
  TaskID,
  TaskRepetitionEvent,
  TaskRepetitionOutcome,
} from "@withorbit/core";
import { OrbitStore } from "@withorbit/store-shared";
import { encode as encodeBase64 } from "base-64";
import { createDefaultOrbitStore } from "./model2/orbitStoreFactory.js";

let _store: OrbitStore | null = null;
async function getStore() {
  if (!_store) {
    _store = await createDefaultOrbitStore();
  }
  return _store;
}

async function generateReviewQueue(): Promise<ReviewItem[]> {
  console.log("REQUEST REVIEW QUEUE");
  const store = await getStore();
  console.log("GOT STORE");
  const thresholdTimestampMillis = getReviewQueueFuzzyDueTimestampThreshold();

  const dueTasks = await store.database.listEntities<Task>({
    entityType: EntityType.Task,
    limit: 500,
    predicate: ["dueTimestampMillis", "<=", thresholdTimestampMillis],
  });
  const reviewQueue = createReviewQueue(dueTasks);

  console.log("Review queue length:", reviewQueue.length);
  return reviewQueue;
}

async function recordReview(
  taskID: TaskID,
  componentID: string,
  outcome: TaskRepetitionOutcome,
  timestampMillis: number,
) {
  const store = await getStore();
  const e: TaskRepetitionEvent = {
    type: EventType.TaskRepetition,
    id: generateUniqueID(),
    entityID: taskID,
    reviewSessionID: "WIDGET", // TODO pass from widget
    componentID, // TODO pass from widget
    timestampMillis,
    outcome,
  };
  await store.database.putEvents([e]);
  console.log("Wrote", e);
}

Object.assign(globalThis, {
  generateReviewQueue,
  recordReview,
  btoa: encodeBase64,
});
