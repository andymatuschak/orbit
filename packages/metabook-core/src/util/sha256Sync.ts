import { Sha256 } from "@aws-crypto/sha256-js";
import { sha256 as multiformatsSHA256 } from "multiformats/hashes/sha2";
import { Digest, create as createDigest } from "multiformats/hashes/digest";

// The multiformats sha implementation is async, which is sometimes inconvenient.
export function sha256Sync(input: Uint8Array): Digest {
  const hash = new Sha256();
  hash.update(input);
  const digest = hash.digestSync();
  return createDigest(multiformatsSHA256.code, digest);
}
