import {
  AttachmentID,
  AttachmentMIMEType,
  AttachmentReference,
  EntityType,
} from "@withorbit/core2";
import { AttachmentStoreInMemory } from "./attachmentStoreInMemory";

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
  await store.storeAttachment(
    Buffer.from("Test"),
    testAttachmentReference.id,
    testAttachmentReference.mimeType,
  );

  const url = await store.getURLForStoredAttachment(testAttachmentReference.id);
  expect(url).toMatchInlineSnapshot(`"data:image/png;base64,VGVzdA=="`);
});
