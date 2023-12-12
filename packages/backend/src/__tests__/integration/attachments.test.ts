import {
  AttachmentID,
  AttachmentMIMEType,
  generateUniqueID,
} from "@withorbit/core";
import { resetLocalEmulators } from "../emulators.js";
import { setupTestOrbitAPIClient } from "../firebaseTesting.js";

const testAttachmentBase64Data = "VGVzdA==";
const testID = generateUniqueID<AttachmentID>();

beforeEach(async () => {
  await resetLocalEmulators();
});

test("ingests URLs", async () => {
  const client = await setupTestOrbitAPIClient();
  await client.ingestAttachmentsFromURLs2([
    {
      id: testID,
      url: `data:image/png;base64,${testAttachmentBase64Data}`,
    },
  ]);

  const { contents, mimeType } = await client.getAttachment2(testID);
  const savedBase64Data = Buffer.from(contents).toString("base64");
  expect(mimeType).toEqual(AttachmentMIMEType.PNG);
  expect(savedBase64Data).toEqual(testAttachmentBase64Data);

  // There should be a corresponding event.
  const events = await client.listEvents2({ entityID: testID });
  expect(events.items.length).toEqual(1);
});

test("round-trips attachments", async () => {
  const client = await setupTestOrbitAPIClient();
  await client.putAttachment2(
    testID,
    AttachmentMIMEType.PNG,
    Buffer.from(testAttachmentBase64Data, "base64"),
  );
  const { contents, mimeType } = await client.getAttachment2(testID);
  const savedBase64Data = Buffer.from(contents).toString("base64");
  expect(mimeType).toEqual(AttachmentMIMEType.PNG);
  expect(savedBase64Data).toEqual(testAttachmentBase64Data);
});
