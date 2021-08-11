import { EntityID } from "./entity";
import { EventID } from "./event";
import { v4 as uuidV4 } from "uuid";
import { fromByteArray as base64FromByteArray } from "base64-js";

// Orbit ID strings are UUIDs (either v4 or v5), encoded to base64 (web-safe variant: psee RFC 4648 section 5](https://datatracker.ietf.org/doc/html/rfc4648#section-5). They're of known size (128 bits) so we can safely drop the "==" padding which would normally appear at the end of the string.

export function encodeUUIDBytesToWebSafeBase64ID<ID extends EntityID | EventID>(
  bytes: Uint8Array,
): ID {
  const base64 = base64FromByteArray(bytes);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").substring(0, 22) as ID; // Drop '==' padding
}

export function generateUniqueID<ID extends EntityID | EventID>(
  rng: (() => ArrayLike<number>) | null = null,
): ID {
  const bytes = new Uint8Array(16);
  uuidV4(rng ? { rng } : null, bytes, 0);
  return encodeUUIDBytesToWebSafeBase64ID(bytes);
}
