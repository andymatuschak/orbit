import {
  AttachmentID,
  AttachmentMIMEType,
  AttachmentReference,
  EntityType,
} from "@withorbit/core";
import fs from "fs";
import os from "os";
import path from "path";
import { OrbitStoreFS } from "./orbitStoreFS.js";

let dbPath: string;
let store: OrbitStoreFS;
beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), "orbit-test-" + Math.random());
  store = new OrbitStoreFS(dbPath);
});

test("store is created when it doesn't exist", async () => {
  const dbStats = await fs.promises.stat(path.join(dbPath));
  expect(dbStats.isFile()).toBe(true);
  await store.close();
});

describe("attachments", () => {
  const testAttachmentReference: AttachmentReference = {
    id: "x" as AttachmentID,
    createdAtTimestampMillis: 1000,
    type: EntityType.AttachmentReference,
    mimeType: AttachmentMIMEType.PNG,
  };

  test("non-existent ID URL resolves to null", async () => {
    expect(
      await store.attachmentStore.getURLForStoredAttachment(
        testAttachmentReference.id,
      ),
    ).toBeNull();
  });

  test("after downloading URL resolves", async () => {
    const testBuffer = Buffer.from("Test");
    await store.attachmentStore.storeAttachment(
      testBuffer,
      testAttachmentReference.id,
      testAttachmentReference.mimeType,
    );

    const url = await store.attachmentStore.getURLForStoredAttachment(
      testAttachmentReference.id,
    );
    expect(path.basename(url!)).toBeTruthy();

    const { contents, type } = await store.attachmentStore.getAttachment(
      testAttachmentReference.id,
    );
    expect(contents).toEqual(new Uint8Array(testBuffer));
    expect(type).toEqual(testAttachmentReference.mimeType);
  });
});
