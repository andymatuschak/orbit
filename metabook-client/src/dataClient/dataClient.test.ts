import firebase from "firebase/app";
import "firebase/firestore";

import * as firebaseTesting from "@firebase/testing";
import {
  Attachment,
  getIDForAttachment,
  getIDForPrompt,
  imageAttachmentType,
  PromptID,
} from "metabook-core";
import { testBasicPrompt } from "metabook-sample-data";
import { getDataCollectionReference } from "../firebase";
import shimFirebasePersistence from "firebase-node-persistence-shim";
import { MetabookFirebaseDataClient } from "./dataClient";

const testProjectID = "metabook-system";
let testApp: firebase.app.App;
let dataClient: MetabookFirebaseDataClient;
let cacheWriteHandler: jest.Mock;

beforeAll(async () => {
  await shimFirebasePersistence();
});

beforeEach(async () => {
  testApp = firebaseTesting.initializeTestApp({
    projectId: testProjectID,
  });
  const testFunctions = testApp.functions();
  testFunctions.useFunctionsEmulator("http://localhost:5001");
  await testApp.firestore().enablePersistence();

  cacheWriteHandler = jest.fn();
  dataClient = new MetabookFirebaseDataClient(
    testApp,
    testFunctions,
    cacheWriteHandler,
  );
});

afterEach(() => {
  return firebaseTesting.clearFirestoreData({ projectId: testProjectID });
});

async function writeTestPromptData() {
  const adminApp = firebaseTesting.initializeAdminApp({
    projectId: testProjectID,
  });
  const adminDatabase = adminApp.firestore();
  const dataCollectionRef = getDataCollectionReference(adminDatabase);
  await dataCollectionRef.doc("test").set(testBasicPrompt);
}

const testPromptID = "test" as PromptID;

describe("getData", () => {
  test("reads card data", async () => {
    await writeTestPromptData();

    const mockFn = jest.fn();
    await dataClient.getPrompts(new Set([testPromptID]), mockFn)
      .completion;
    expect(mockFn.mock.calls[0][0]).toMatchObject(
      new Map([["test", testBasicPrompt]]),
    );
  });

  test("calls callback even when set of cards to read is empty", async () => {
    const mockFn = jest.fn();
    await dataClient.getPrompts(new Set(), mockFn).completion;
    expect(mockFn).toHaveBeenCalled();
  });

  test("reads cached data", async () => {
    await writeTestPromptData();

    await testApp.firestore().disableNetwork();
    const mockFn = jest.fn();
    await dataClient.getPrompts(new Set([testPromptID]), mockFn)
      .completion;
    expect(mockFn.mock.calls[0][0].get("test")).toBeInstanceOf(Error);

    await testApp.firestore().enableNetwork();
    mockFn.mockClear();
    await dataClient.getPrompts(new Set([testPromptID]), mockFn)
      .completion;
    expect(mockFn.mock.calls[0][0]).toMatchObject(
      new Map([["test", testBasicPrompt]]),
    );

    await testApp.firestore().disableNetwork();
    mockFn.mockClear();
    await dataClient.getPrompts(new Set([testPromptID]), mockFn)
      .completion;
    expect(mockFn.mock.calls[0][0]).toMatchObject(
      new Map([["test", testBasicPrompt]]),
    );
  });
});

test("records prompt spec", async () => {
  await dataClient.recordPrompts([testBasicPrompt]);
  const testPromptTaskID = getIDForPrompt(testBasicPrompt);
  const mockFn = jest.fn();
  await dataClient.getPrompts(new Set([testPromptTaskID]), mockFn).completion;
  expect(mockFn.mock.calls[0][0].get(testPromptTaskID)).toMatchObject(
    testBasicPrompt,
  );
  // TODO test recording new prompts when the network is down
});

test("records attachments", async () => {
  const testAttachment: Attachment = {
    type: imageAttachmentType,
    mimeType: "image/png",
    contents: "test attachment",
  };
  await dataClient.recordAttachments([testAttachment]);
  const testAttachmentID = getIDForAttachment(
    Buffer.from(testAttachment.contents),
  );

  const mockURL = "https://test.org";
  cacheWriteHandler.mockImplementation(() => mockURL);

  const mockFn = jest.fn();
  await dataClient.getAttachments(new Set([testAttachmentID]), mockFn)
    .completion;
  expect(mockFn.mock.calls[0][0].get(testAttachmentID)).toMatchObject({
    type: imageAttachmentType,
    url: mockURL,
  });
  // TODO test recording new prompts when the network is down
});
