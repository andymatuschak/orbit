import React from "react";
import { Platform } from "react-native";
import { initializeReporter } from "./src/errorReporting.js";
import Root from "./src/Root.js";

if (Platform.OS === "ios" || Platform.OS === "macos") {
  // TODO 2023-12-15
  // initIntentHandlers();
}

export default function App() {
  React.useEffect(() => {
    initializeReporter();
  }, []);

  return <Root />;
}
