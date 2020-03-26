require("node-libs-react-native/globals");
require("./src/shimBase64");
const Root = require("./src/Root").default;

import React from "react";

import { Platform } from "react-native";

// expo-web is inspired or based on react-native-web
// which introduces a 'web' as platform value
if (Platform.OS !== "web") {
  // window = undefined;
}

export default function App() {
  return <Root />;
}
