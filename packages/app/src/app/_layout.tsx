import "../util/shims.js";

import { Slot } from "expo-router";
import React from "react";
import { initializeReporter } from "../errorReporting";
import { initIntentHandlers } from "../util/intents/IntentHandler.js";
import usePageViewTracking from "../util/usePageViewTracking";

initIntentHandlers();

export default function RootLayout() {
  usePageViewTracking();
  React.useEffect(() => {
    initializeReporter();
  }, []);

  return <Slot />;
}
