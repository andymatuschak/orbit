import { Digest } from "multiformats/hashes/digest";
import { sha256 as _sha256 } from "multiformats/hashes/sha2";

// We wrap the multiformats implementation for the web to make sure subtle.crypto is available. See sha256.web.ts.
export function sha256(input: Uint8Array): Promise<Digest> {
  return _sha256.digest(input);
}
