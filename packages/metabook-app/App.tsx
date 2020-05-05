import React from "react";
import "node-libs-react-native/globals";
import "./src/shimBase64";
import * as Random from "expo-random";
import "expo-asset";

import { Platform } from "react-native";
import Root from "./src/Root";

// expo-web is inspired or based on react-native-web
// which introduces a 'web' as platform value
if (Platform.OS !== "web") {
  // window = undefined;
}

export default function App() {
  return <Root />;
}
