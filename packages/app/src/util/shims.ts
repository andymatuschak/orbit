import { Blob as ExpoBlob } from "expo-blob";
import { getRandomValues, randomUUID } from "expo-crypto";

globalThis.Blob = ExpoBlob as unknown as typeof Blob;
globalThis.crypto ??= {} as Crypto;
globalThis.crypto.getRandomValues ??= getRandomValues;
globalThis.crypto.randomUUID ??=
  randomUUID as typeof globalThis.crypto.randomUUID;
