import { AttachmentMIMEType } from "../entities/attachmentReference.js";

export const maximumAttachmentByteLength = 10 * 1024 * 1024;

export function sniffAttachmentMediaType(
  bytes: Uint8Array,
): AttachmentMIMEType | null {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return AttachmentMIMEType.PNG;
  }
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return AttachmentMIMEType.JPEG;
  }
  const prefix = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.byteLength, 4096)))
    .replace(/^\uFEFF/, "")
    .trimStart();
  return /^(?:<\?xml[\s\S]*?\?>\s*)?<svg(?:\s|>)/i.test(prefix)
    ? AttachmentMIMEType.SVG
    : null;
}

export function assertSafeAttachmentBytes(input: {
  bytes: Uint8Array;
  mediaTypeHint?: AttachmentMIMEType;
}): AttachmentMIMEType {
  if (input.bytes.byteLength > maximumAttachmentByteLength) {
    throw new Error("Attachment exceeds the 10 MiB limit");
  }
  const mediaType = sniffAttachmentMediaType(input.bytes);
  if (!mediaType) {
    throw new Error("Attachment bytes have an unsupported media type");
  }
  if (input.mediaTypeHint && input.mediaTypeHint !== mediaType) {
    throw new Error("Attachment MIME hint does not match sniffed bytes");
  }
  if (mediaType === AttachmentMIMEType.SVG) {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(
      input.bytes,
    );
    if (
      /<script\b/i.test(source) ||
      /\son[a-z]+\s*=/i.test(source) ||
      /(?:href|src)\s*=\s*["']\s*(?:https?:|javascript:|data:)/i.test(source) ||
      /<!ENTITY\b/i.test(source)
    ) {
      throw new Error("SVG requires sanitization before safe rendering");
    }
  }
  return mediaType;
}
