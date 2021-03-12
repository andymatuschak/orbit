import {
  AttachmentID,
  AttachmentMimeType,
  getIDForAttachment,
} from "@withorbit/core";
import { getStorageObjectNameForAttachmentID } from "@withorbit/firebase-support";
import stream from "stream";
import {
  _getAttachmentIDForStoredObjectName,
  _validateAttachmentDataFromReadStream,
  _validateAttachmentResponse,
  _validateStoredAttachment,
} from "./attachments";
import * as Fetch from "node-fetch";

const testData = Buffer.from("Risus facilisis tempus sed dolor ante orci");
let testDataID: AttachmentID;
beforeAll(async () => {
  testDataID = await getIDForAttachment(testData);
});
let readable: stream.PassThrough;
beforeEach(() => {
  readable = new stream.PassThrough();
  readable.end(testData);
});

describe("_validateAttachmentDataFromReadStream", () => {
  test("valid ID", async () => {
    expect(
      async () =>
        await _validateAttachmentDataFromReadStream(readable, testDataID),
    ).not.toThrow();
  });
  test("invalid ID", async () => {
    expect(
      _validateAttachmentDataFromReadStream(readable, "foo" as AttachmentID),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe("_getAttachmentIDForStoredObjectName", () => {
  test("round trips", async () => {
    const id = await getIDForAttachment(testData);
    const objectName = getStorageObjectNameForAttachmentID(id);
    expect(_getAttachmentIDForStoredObjectName(objectName)).toEqual(id);
  });
});

describe("_validateStoredAttachment", () => {
  test("valid content type passes", () => {
    expect(async () =>
      _validateStoredAttachment(readable, AttachmentMimeType.PNG, testDataID),
    ).not.toThrow();
  });

  test("null content type fails", () => {
    expect(
      _validateStoredAttachment(readable, null, testDataID),
    ).rejects.toBeInstanceOf(Error);
  });
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
        ({
          status: 200,
          headers: { get: () => null },
        } as unknown) as Fetch.Response,
        "http://foo.com",
      ),
    ).toBeInstanceOf(Error);
  });

  test("valid response", () => {
    expect(
      _validateAttachmentResponse(
        ({
          status: 200,
          headers: { get: () => "image/png" },
        } as unknown) as Fetch.Response,
        "http://foo.com",
      ),
    ).toBe(AttachmentMimeType.PNG);
  });
});
