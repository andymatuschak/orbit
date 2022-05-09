import "./src/util/nodeShims";
import "expo-asset";

import React from "react";
import { initializeReporter } from "./src/errorReporting/reporter";

import Root from "./src/Root";

import { initIntentHandlers } from "./src/util/intents/IntentHandler";
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
