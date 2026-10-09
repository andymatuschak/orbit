import type OrbitAPIClient from "@withorbit/api-client";
import {
  TaskRepetitionOutcome,
  type ObservationID,
  type TaskID,
  type VaultMutation,
  type VaultMutationID,
} from "@withorbit/core";
import type { OrbitStore } from "@withorbit/store-shared";
import { expect, test } from "bun:test";
import type { WidgetProjectionBridge } from "../vault/widgetProjection.js";
import { LegacyReviewDatabase } from "./LegacyReviewDatabase.js";

test("legacy review writes do not wait for the disposable widget projection", async () => {
  let releaseProjection!: () => void;
  const projectionMayFinish = new Promise<void>((resolve) => {
    releaseProjection = resolve;
  });
  const database = {
    async listEntities() {
      return [];
    },
    async putEvents() {},
    async close() {},
  };
  const bridge: WidgetProjectionBridge = {
    async readPendingReviews() {
      return [];
    },
    async markReviewsImported() {},
    async replaceProjection() {
      await projectionMayFinish;
    },
  };
  const reviewDatabase = await LegacyReviewDatabase.open(
    null as unknown as OrbitAPIClient,
    "legacy-test",
    {
      createStore: async () =>
        ({ database, attachmentStore: {} }) as unknown as OrbitStore,
      syncStore: async () => {},
      widgetProjectionBridge: bridge,
    },
  );
  const mutation: VaultMutation = {
    kind: "recordReview",
    mutationID: "review/0123456789ABCDEFGHIJKL" as VaultMutationID,
    observationID: "review/0123456789ABCDEFGHIJKL" as ObservationID,
    taskID: "task/legacy-test" as TaskID,
    componentID: "main",
    reviewSessionID: "test",
    outcome: TaskRepetitionOutcome.Remembered,
    occurredAtTimestampMillis: 1,
  };

  await expect(
    Promise.race([
      reviewDatabase.apply([mutation]).then(() => "applied"),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("timed-out"), 25),
      ),
    ]),
  ).resolves.toBe("applied");

  releaseProjection();
  await reviewDatabase.close();
});
