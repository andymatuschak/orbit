import fs from "fs";
import jestFetchMock from "jest-fetch-mock";
import os from "os";
import path from "path";
import stream from "stream";
import { fileURLToPath } from "url";
import {
  AttachmentID,
  AttachmentMIMEType,
  AttachmentReference,
  EntityType,
} from "@withorbit/core2";
import { AttachmentStoreFS } from "./attachmentStoreFS";

beforeAll(() => {
  jestFetchMock.enableMocks();
});

beforeEach(() => {
  jestFetchMock.resetMocks();
});

afterAll(() => {
  jestFetchMock.dontMock();
});

let store: AttachmentStoreFS;
beforeEach(async () => {
  const tempPath = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "orbit-test-" + Math.random()),
  );
  store = new AttachmentStoreFS(tempPath);
});

const testAttachmentReference: AttachmentReference = {
  id: "x" as AttachmentID,
  createdAtTimestampMillis: 1000,
  type: EntityType.AttachmentReference,
  mimeType: AttachmentMIMEType.PNG,
};

test("non-existent ID URL resolves to null", async () => {
  expect(
    await store.getURLForStoredAttachment(
      testAttachmentReference.id,
      testAttachmentReference.mimeType,
    ),
  ).toBeNull();
});

test("after downloading URL resolves", async () => {
  // @ts-ignore
  jestFetchMock.mockResponse(stream.Readable.from("Test"));
  await store.storeAttachmentFromURL(
    "http://foo.com",
    testAttachmentReference.id,
    testAttachmentReference.mimeType,
  );

  const url = await store.getURLForStoredAttachment(
    testAttachmentReference.id,
    testAttachmentReference.mimeType,
  );
  expect(path.basename(url!)).toBe("x.png");

  const filePath = fileURLToPath(url!);
  const contents = await fs.promises.readFile(filePath, "utf-8");
  expect(contents).toBe("Test");
});
