import {
  AttachmentMimeType,
  getAttachmentMimeTypeFromResourceMetadata,
} from "./attachment";

describe("getAttachmentMimeTypeFromResponse", () => {
  test("get from contentType", () => {
    expect(
      getAttachmentMimeTypeFromResourceMetadata("image/png", null),
    ).toEqual(AttachmentMimeType.PNG);
  });

  test("get from URL", () => {
    expect(
      getAttachmentMimeTypeFromResourceMetadata(
        null,
        "https://foo.com/foo.png?hmac=lkjasdf",
      ),
    ).toEqual(AttachmentMimeType.PNG);
  });

  test("no content type, invalid URL", () => {
    expect(
      getAttachmentMimeTypeFromResourceMetadata(null, "https://foo.com"),
    ).toBeNull();
  });

  test("no content type, no URL", () => {
    expect(getAttachmentMimeTypeFromResourceMetadata(null, null)).toBeNull();
  });
});
