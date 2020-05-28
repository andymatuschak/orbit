import * as FirebaseTesting from "metabook-firebase-support/dist/firebaseTesting";
import firebase from "firebase/app";
import "firebase/firestore";
import {
  Attachment,
  AttachmentMimeType,
  getIDForAttachment,
  getIDForPrompt,
  imageAttachmentType,
} from "metabook-core";
import { getReferenceForDataRecordID } from "metabook-firebase-support";
import { testBasicPrompt } from "metabook-sample-data";
import { MetabookFirebaseDataClient } from "./dataClient";

let testFirestore: firebase.firestore.Firestore;
let dataClient: MetabookFirebaseDataClient;
let cacheWriteHandler: jest.Mock;

beforeEach(async () => {
  const { functions, firestore } = FirebaseTesting.createTestFirebaseApp();
  testFirestore = firestore;
  cacheWriteHandler = jest.fn();
  dataClient = new MetabookFirebaseDataClient(testFirestore, functions);
});

afterEach(async () => {
  FirebaseTesting.resetTestFirebaseApp(testFirestore);
});

const testPromptID = getIDForPrompt(testBasicPrompt);
async function writeTestPromptData() {
  const { firestore } = FirebaseTesting.createTestAdminFirebaseApp();
  await getReferenceForDataRecordID(firestore, testPromptID).set(
    testBasicPrompt,
  );
}

describe("getData", () => {
  test("reads card data", async () => {
    await writeTestPromptData();
    const prompts = await dataClient.getPrompts(new Set([testPromptID]));
    expect(prompts.get(testPromptID)).toMatchObject(testBasicPrompt);
  });

  test("returns empty list when input is empty", async () => {
    expect(await dataClient.getPrompts(new Set([]))).toMatchObject(new Map());
  });
});

test("records prompt spec", async () => {
  await dataClient.recordPrompts([testBasicPrompt]);
  const testPromptTaskID = getIDForPrompt(testBasicPrompt);
  const prompts = await dataClient.getPrompts([testPromptTaskID]);
  expect(prompts.get(testPromptTaskID)).toMatchObject(testBasicPrompt);
});

test("records attachments", async () => {
  const testAttachment: Attachment = {
    type: imageAttachmentType,
    mimeType: AttachmentMimeType.PNG,
    contents: "test attachment",
  };
  await dataClient.recordAttachments([testAttachment]);
  const testAttachmentID = getIDForAttachment(
    Buffer.from(testAttachment.contents),
  );

  const mockURL = "https://test.org";
  cacheWriteHandler.mockImplementation(() => mockURL);

  const attachments = await dataClient.getAttachments([testAttachmentID]);
  expect(attachments.get(testAttachmentID)).toMatchObject(testAttachment);
});
