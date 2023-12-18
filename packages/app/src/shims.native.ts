import { getRandomValues, randomUUID } from "expo-crypto";
// @ts-ignore
global.crypto ||= {};
// @ts-ignore
global.crypto.getRandomValues = getRandomValues;
// @ts-ignore
global.crypto.randomUUID = randomUUID;

import { shim as shimBase64 } from "react-native-quick-base64";
shimBase64(); // add btoa to globals for @withorbit/core
