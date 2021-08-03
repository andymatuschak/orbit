import jestFetchMock from "jest-fetch-mock";
import {
  AttachmentID,
  AttachmentMIMEType,
  AttachmentReference,
  EntityType,
} from "@withorbit/core2";
import { AttachmentStoreInMemory } from "./attachmentStoreInMemory";

beforeAll(() => {
  jestFetchMock.enableMocks();
});

beforeEach(() => {
  jestFetchMock.resetMocks();
});

afterAll(() => {
  jestFetchMock.dontMock();
});

let store: AttachmentStoreInMemory;
beforeEach(async () => {
  store = new AttachmentStoreInMemory();
});

const testAttachmentReference: AttachmentReference = {
  id: "x" as AttachmentID,
  createdAtTimestampMillis: 5000,
  type: EntityType.AttachmentReference,
  mimeType: AttachmentMIMEType.PNG,
};

test("non-existent ID URL resolves to null", async () => {
  expect(
    await store.getURLForStoredAttachment(testAttachmentReference.id),
  ).toBeNull();
});

test("after downloading URL resolves", async () => {
  // @ts-ignore
  jestFetchMock.mockResponse("Test");
  await store.storeAttachmentFromURL(
    "http://foo.com",
    testAttachmentReference.id,
    testAttachmentReference.mimeType,
  );

  const url = await store.getURLForStoredAttachment(testAttachmentReference.id);
  expect(url).toMatchInlineSnapshot(`"data:image/png;base64,VGVzdA=="`);
});
