import "./src/util/nodeShims.js";
import "expo-asset";

import React from "react";
import { initializeReporter } from "./src/errorReporting/reporter.js";

import Root from "./src/Root.js";

import { initIntentHandlers } from "./src/util/intents/IntentHandler.js";
import { Platform } from "react-native";

if (Platform.OS === "ios" || Platform.OS === "macos") {
  initIntentHandlers();
}

export default function App() {
  React.useEffect(() => {
    initializeReporter();
  }, []);

  return <Root />;
}
