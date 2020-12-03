import { sha256 as _sha256 } from "multiformats/hashes/sha2";
import { Digest, create as createDigest } from "multiformats/hashes/digest";
import { sha256Sync } from "./sha256Sync";

export async function sha256(input: Uint8Array): Promise<Digest> {
  // window.crypto.subtle isn't available in HTTP, so we use a JS implementation.
  if (window.crypto && window.crypto.subtle) {
    return _sha256.digest(input);
  } else {
    const digest = sha256Sync(input);
    return createDigest(_sha256.code, digest);
  }
}
