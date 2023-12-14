/// <reference lib="dom" />

declare module globalThis {
  const crypto: Crypto;
}
export const crypto = globalThis.crypto;
