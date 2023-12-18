import { EntityID } from "./entity.js";
import { EventID } from "./event.js";
import { crypto } from "./util/crypto.js";

if (!btoa) {
  throw new Error(
    "Need to shim btoa before importing this; see react-native-quick-base64",
  );
}

// Orbit ID strings are UUIDs (either v4 or v5), encoded to base64 (web-safe variant: psee RFC 4648 section 5](https://datatracker.ietf.org/doc/html/rfc4648#section-5). They're of known size (128 bits) so we can safely drop the "==" padding which would normally appear at the end of the string.
export function encodeUUIDBytesToWebSafeBase64ID<ID extends EntityID | EventID>(
  bytes: Uint8Array,
): ID {
  if (bytes.length !== 16) {
    throw new Error(`UUID is invalid length: ${bytes.length}`);
  }
  const base64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").substring(0, 22) as ID; // Drop '==' padding
}

export function generateUniqueID<ID extends EntityID | EventID>(): ID {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(uuid.substr(i * 2, 2), 16);
  }
  return encodeUUIDBytesToWebSafeBase64ID(bytes);
}
