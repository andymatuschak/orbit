import * as firebaseTesting from "@firebase/testing";
import shimFirebasePersistence from "firebase-node-persistence-shim";
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

const testProjectID = "metabook-system";
const functionsEmulatorURL = "http://localhost:5001";
let testApp: firebase.app.App;
let testFunctions: firebase.functions.Functions;
let dataClient: MetabookFirebaseDataClient;
let cacheWriteHandler: jest.Mock;

beforeAll(async () => {
  await shimFirebasePersistence();
});

beforeEach(async () => {
  testApp = firebaseTesting.initializeTestApp({
    projectId: testProjectID,
  });
  testFunctions = testApp.functions();
  testFunctions.useFunctionsEmulator(functionsEmulatorURL);
  await testApp.firestore().enablePersistence();

  cacheWriteHandler = jest.fn();
  dataClient = new MetabookFirebaseDataClient(
    testApp,
    testFunctions,
    cacheWriteHandler,
  );
});

afterEach(async () => {
  await testApp.firestore().terminate();
  await testApp.firestore().clearPersistence();
  return firebaseTesting.clearFirestoreData({ projectId: testProjectID });
});

const testPromptID = getIDForPrompt(testBasicPrompt);
async function writeTestPromptData() {
  const adminApp = firebaseTesting.initializeAdminApp({
    projectId: testProjectID,
  });
  const adminDatabase = adminApp.firestore();
  await getReferenceForDataRecordID(adminDatabase, testPromptID).set(
    testBasicPrompt,
  );
}

describe("getData", () => {
  test("reads card data", async () => {
    await writeTestPromptData();
    const prompts = await dataClient.getPrompts(new Set([testPromptID]));
    expect(prompts[0]).toMatchObject(testBasicPrompt);
  });

  test("returns empty list when input is empty", async () => {
    const mockFn = jest.fn();
    expect(await dataClient.getPrompts(new Set([]))).toMatchObject([]);
  });
});

test("records prompt spec", async () => {
  await dataClient.recordPrompts([testBasicPrompt]);
  const testPromptTaskID = getIDForPrompt(testBasicPrompt);
  const prompts = await dataClient.getPrompts([testPromptTaskID]);
  expect(prompts[0]).toMatchObject(testBasicPrompt);
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
  expect(attachments[0]).toMatchObject(testAttachment);
});
