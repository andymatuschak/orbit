// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/prefer-namespace-keyword
declare module globalThis {
  const crypto: WebCrypto;
}
type WebCrypto = typeof import("node:crypto").webcrypto;

if (!globalThis.crypto?.getRandomValues) {
  throw new Error(
    "Need to shim crypto.getRandomValues before importing this (e.g. with expo-crypto)",
  );
}
if (!globalThis.crypto?.randomUUID) {
  throw new Error(
    "Need to shim crypto.randomUUID before importing this (e.g. with expo-crypto)",
  );
}

const getRandomValues = globalThis.crypto.getRandomValues;
const randomUUID = globalThis.crypto.randomUUID;
export const crypto = { getRandomValues, randomUUID };
