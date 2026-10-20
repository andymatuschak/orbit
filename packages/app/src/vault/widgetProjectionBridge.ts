import type { WidgetProjectionBridge } from "./widgetProjection.js";
import { decodeWidgetReviewOutbox } from "./widgetProjection.js";
import { getOrbitAutomergeNative } from "./orbitAutomergeNative.js";
import { AppState } from "react-native";

let cachedBridge: WidgetProjectionBridge | undefined;

export function getWidgetProjectionBridge(): WidgetProjectionBridge {
  cachedBridge ??= {
    async finishInBackground(operation) {
      const native = getOrbitAutomergeNative();
      const task = await native.beginReviewWork();
      try {
        await operation();
      } finally {
        await native.endReviewWork(task);
      }
    },
    subscribeToForeground: (listener) => {
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") listener();
      });
      return () => subscription.remove();
    },
    replaceProjection: async ({ vaultID, reviewItems, revision }) => {
      await getOrbitAutomergeNative().replaceWidgetProjection(
        vaultID,
        JSON.stringify(reviewItems),
        revision,
      );
    },
    readPendingReviews: async (vaultID) =>
      decodeWidgetReviewOutbox(
        await getOrbitAutomergeNative().pendingWidgetReviewsJSON(vaultID),
      ),
    markReviewsImported: async ({
      vaultID,
      observationIDs,
      reviewItems,
      revision,
    }) => {
      await getOrbitAutomergeNative().markWidgetReviewsImported(
        vaultID,
        [...observationIDs],
        JSON.stringify(reviewItems),
        revision,
      );
    },
  };
  return cachedBridge;
}
