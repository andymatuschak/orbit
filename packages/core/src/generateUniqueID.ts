import { EntityID } from "./entity.js";
import { crypto } from "./util/crypto.js";

// Orbit IDs are 128-bit UUIDs encoded with URL-safe base64 (RFC 4648 section 5).
// Their fixed size lets us omit the trailing "==" padding.
export function encodeUUIDBytesToWebSafeBase64ID<ID extends EntityID>(
  bytes: Uint8Array,
): ID {
  if (bytes.length !== 16) {
    throw new Error(`UUID is invalid length: ${bytes.length}`);
  }
  const base64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").substring(0, 22) as ID; // Drop '==' padding
}

export function generateUniqueID<ID extends EntityID>(): ID {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(uuid.substr(i * 2, 2), 16);
  }
  return encodeUUIDBytesToWebSafeBase64ID(bytes);
}
