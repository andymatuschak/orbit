import {
  AttachmentID,
  AttachmentMIMEType,
  generateUniqueID,
} from "@withorbit/core2";
import { resetLocalEmulators } from "../emulators";
import { setupTestOrbitAPIClient } from "./utils/setupAuthToken";

const testAttachmentBase64Data = "VGVzdA==";
const testID = generateUniqueID<AttachmentID>(() => Buffer.from("test"));

afterEach(async () => {
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

  const blob = await client.getAttachment2(testID);
  const savedBase64Data = new Buffer(await blob.arrayBuffer()).toString(
    "base64",
  );
  expect(blob.type).toEqual(AttachmentMIMEType.PNG);
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
  const blob = await client.getAttachment2(testID);
  const savedBase64Data = new Buffer(await blob.arrayBuffer()).toString(
    "base64",
  );
  expect(blob.type).toEqual(AttachmentMIMEType.PNG);
  expect(savedBase64Data).toEqual(testAttachmentBase64Data);
});
