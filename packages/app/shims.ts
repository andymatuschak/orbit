import "@expo/metro-runtime"; // TODO: remove this (for HMR) once/if we adopt Expo Router; see https://github.com/expo/expo/issues/23104
// import { polyfillWebCrypto } from "expo-standard-web-crypto";
// polyfillWebCrypto();

import { getRandomValues, randomUUID } from "expo-crypto";
// @ts-ignore
global.crypto ||= {};
// @ts-ignore
global.crypto.getRandomValues = getRandomValues;
// @ts-ignore
global.crypto.randomUUID = randomUUID;
