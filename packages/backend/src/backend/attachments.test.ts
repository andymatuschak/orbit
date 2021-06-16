import { AttachmentMimeType, getIDForAttachment } from "@withorbit/core";
import stream from "stream";
import { _validateAttachmentResponse } from "./attachments";
import * as Fetch from "node-fetch";

const testData = Buffer.from("Risus facilisis tempus sed dolor ante orci");

beforeAll(async () => {
  await getIDForAttachment(testData);
});

let readable: stream.PassThrough;
beforeEach(() => {
  readable = new stream.PassThrough();
  readable.end(testData);
});

describe("_validateAttachmentResponse", () => {
  test("bad status", () => {
    expect(
      _validateAttachmentResponse({ status: 400 } as Fetch.Response, ""),
    ).toBeInstanceOf(Error);
  });

  test("bad content type", () => {
    expect(
      _validateAttachmentResponse(
        {
          status: 200,
          headers: { get: () => null },
        } as unknown as Fetch.Response,
        "http://foo.com",
      ),
    ).toBeInstanceOf(Error);
  });

  test("valid response", () => {
    expect(
      _validateAttachmentResponse(
        {
          status: 200,
          headers: { get: () => "image/png" },
        } as unknown as Fetch.Response,
        "http://foo.com",
      ),
    ).toBe(AttachmentMimeType.PNG);
  });
});
