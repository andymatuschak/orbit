// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/prefer-namespace-keyword
declare module globalThis {
  const crypto: WebCrypto;
}
type WebCrypto = typeof import("node:crypto").webcrypto;
export const crypto = globalThis.crypto as WebCrypto;
