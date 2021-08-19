import { AttachmentMIMEType } from "@withorbit/core";
import base64 from "base64-js";

export function encodeDataURL(data: ArrayBuffer, type: AttachmentMIMEType) {
  const b64String = base64.fromByteArray(new Uint8Array(data));
  return `data:${type};base64,${b64String}`;
}
