/// <reference lib="dom" />

// This one's marked as async becuase the .web variant actually is async.
export default async function sha256(data: Uint8Array): Promise<Buffer> {
  if (!window.crypto.subtle) {
    throw new Error("Crypto unavailable");
  }
  return new Buffer(await window.crypto.subtle.digest("sha256", data));
}
