import { Digest } from "multiformats/hashes/digest";
import { sha256 as _sha256 } from "multiformats/hashes/sha2";
import { sha256Sync } from "./sha256Sync";

export async function sha256(input: Uint8Array): Promise<Digest> {
  // window.crypto.subtle isn't available in HTTP, so we use a JS implementation.
  if (window.crypto && window.crypto.subtle) {
    return _sha256.digest(input);
  } else {
    return sha256Sync(input);
  }
}
