import firebase from "firebase/app";
import "firebase/firestore";
import {
  Attachment,
  AttachmentMimeType,
  getIDForAttachment,
  getIDForPrompt,
  imageAttachmentType,
} from "metabook-core";
import * as FirebaseTesting from "metabook-firebase-support/dist/firebaseTesting";
import { testQAPrompt } from "metabook-sample-data";
import { MetabookFirebaseDataClient } from "./dataClient";

let testFirestore: firebase.firestore.Firestore;
let dataClient: MetabookFirebaseDataClient;
let cacheWriteHandler: jest.Mock;

beforeEach(async () => {
  const { functions, firestore } = FirebaseTesting.createTestFirebaseApp();
  testFirestore = firestore;
  cacheWriteHandler = jest.fn();
  dataClient = new MetabookFirebaseDataClient(functions, cacheWriteHandler);
});

afterEach(async () => {
  await FirebaseTesting.resetTestFirestore(testFirestore);
});

describe("getData", () => {
  test("returns empty list when input is empty", async () => {
    expect(await dataClient.getPrompts([])).toMatchObject(new Map());
  });
});

test("records prompt spec", async () => {
  await dataClient.recordPrompts([testQAPrompt]);
  const testPromptTaskID = await getIDForPrompt(testQAPrompt);
  const prompts = await dataClient.getPrompts([testPromptTaskID]);
  expect(prompts.get(testPromptTaskID)).toMatchObject(testQAPrompt);
});

test("records attachments", async () => {
  const testAttachment: Attachment = {
    type: imageAttachmentType,
    mimeType: AttachmentMimeType.PNG,
    contents: Buffer.from("test attachment"),
  };
  await dataClient.recordAttachments([{ attachment: testAttachment }]);
  const testAttachmentID = await getIDForAttachment(
    Buffer.from(testAttachment.contents),
  );

  const mockURL = "https://test.org";
  cacheWriteHandler.mockImplementation(() => mockURL);

  expect(dataClient.getAttachmentURL(testAttachmentID)).toMatchInlineSnapshot(
    `"https://storage.googleapis.com/metabook-system.appspot.com/attachments/DSaTCPmQCmLJQpL1p9LFdhT8Aad4qw2QuMKRD4zpN6yp"`,
  );
});
