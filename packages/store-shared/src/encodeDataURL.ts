import { AttachmentMIMEType } from "@withorbit/core";
import base64 from "base64-js";

export function encodeDataURL(data: Uint8Array, type: AttachmentMIMEType) {
  const b64String = base64.fromByteArray(data);
  return `data:${type};base64,${b64String}`;
}
