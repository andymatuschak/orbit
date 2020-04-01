import "node-libs-react-native/globals";
import "./src/shimBase64";
import * as Random from "expo-random";

// Fix for https://github.com/firebase/firebase-js-sdk/issues/2827:
// TODO remove once issue is closed
// noinspection ES6UnusedImports
// @ts-ignore
import crypto from "crypto";

import React from "react";
import { Platform } from "react-native";
import Root from "./src/Root";

global.crypto = crypto;
crypto.getRandomValues = (typedArray: any) =>
  typedArray.set(Random.getRandomBytesAsync(typedArray.byteLength));

// expo-web is inspired or based on react-native-web
// which introduces a 'web' as platform value
if (Platform.OS !== "web") {
  // window = undefined;
}

export default function App() {
  return <Root />;
}
