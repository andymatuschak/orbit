import { AttachmentMimeType } from "@withorbit/core";
import fs from "fs";
import jestFetchMock from "jest-fetch-mock";
import path from "path";
import stream from "stream";
import { fileURLToPath } from "url";
import { AttachmentID, AttachmentReference } from "../core2";
import { EntityType } from "../core2/entities/entityBase";
import { NodeAttachmentStore } from "./nodeAttachmentStore";

beforeAll(() => {
  jestFetchMock.enableMocks();
});

beforeEach(() => {
  jestFetchMock.resetMocks();
});

afterAll(() => {
  jestFetchMock.dontMock();
});

let store: NodeAttachmentStore;
beforeEach(async () => {
  const temp = await fs.promises.mkdtemp("orbit-test-");
  store = new NodeAttachmentStore(temp);
});

const testAttachmentReference: AttachmentReference = {
  id: "x" as AttachmentID,
  type: EntityType.AttachmentReference,
  mimeType: AttachmentMimeType.PNG,
};

test("non-existent ID URL resolves to null", async () => {
  expect(
    await store.getURLForStoredAttachment(testAttachmentReference),
  ).toBeNull();
});

test("after downloading URL resolves", async () => {
  // @ts-ignore
  jestFetchMock.mockResponse(stream.Readable.from("Test"));
  await store.storeAttachmentFromURL("http://foo.com", testAttachmentReference);

  const url = await store.getURLForStoredAttachment(testAttachmentReference);
  expect(path.basename(url!)).toBe("x.png");

  const filePath = fileURLToPath(url!);
  const contents = await fs.promises.readFile(filePath, "utf-8");
  expect(contents).toBe("Test");
});
