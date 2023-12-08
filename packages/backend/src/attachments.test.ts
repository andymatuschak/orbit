import { AttachmentMIMEType } from "@withorbit/core";
import { _getAttachmentMIMETypeFromResourceMetadata } from "./attachments.js";

describe("_getAttachmentMIMETypeFromResourceMetadata", () => {
  test("get from contentType", () => {
    expect(
      _getAttachmentMIMETypeFromResourceMetadata("image/png", null),
    ).toEqual(AttachmentMIMEType.PNG);
  });

  test("get from URL", () => {
    expect(
      _getAttachmentMIMETypeFromResourceMetadata(
        null,
        "https://foo.com/foo.png?hmac=lkjasdf",
      ),
    ).toEqual(AttachmentMIMEType.PNG);
  });

  test("no content type, invalid URL", () => {
    expect(
      _getAttachmentMIMETypeFromResourceMetadata(null, "https://foo.com"),
    ).toBeNull();
  });

  test("no content type, no URL", () => {
    expect(_getAttachmentMIMETypeFromResourceMetadata(null, null)).toBeNull();
  });
});
