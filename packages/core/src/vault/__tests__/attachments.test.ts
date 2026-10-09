import { describe, expect, test } from "bun:test";
import { AttachmentMIMEType } from "../../entities/attachmentReference.js";
import {
  assertSafeAttachmentBytes,
  maximumAttachmentByteLength,
  sniffAttachmentMediaType,
} from "../attachments.js";

describe("vault attachments", () => {
  test("sniffs supported image formats", () => {
    expect(sniffAttachmentMediaType(png())).toBe(AttachmentMIMEType.PNG);
    expect(sniffAttachmentMediaType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(
      AttachmentMIMEType.JPEG,
    );
    expect(
      sniffAttachmentMediaType(new TextEncoder().encode("<svg></svg>")),
    ).toBe(AttachmentMIMEType.SVG);
  });

  test("rejects unsafe, mismatched, and oversized attachments", () => {
    expect(() =>
      assertSafeAttachmentBytes({
        bytes: png(),
        mediaTypeHint: AttachmentMIMEType.JPEG,
      }),
    ).toThrow("does not match");
    expect(() =>
      assertSafeAttachmentBytes({
        bytes: new TextEncoder().encode("<svg><script/></svg>"),
      }),
    ).toThrow("sanitization");
    expect(() =>
      assertSafeAttachmentBytes({
        bytes: new Uint8Array(maximumAttachmentByteLength + 1),
      }),
    ).toThrow("10 MiB");
  });
});

function png() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}
