import { Slot } from "expo-router";
import React from "react";
import { useIngestIntentQueue } from "../util/intents/useIngestIntentQueue.js";
import usePageViewTracking from "../util/usePageViewTracking";

export default function RootLayout() {
  usePageViewTracking();
  useIngestIntentQueue();

  return <Slot />;
}
