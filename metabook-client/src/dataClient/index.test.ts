import firebase from "firebase";
import * as firebaseTesting from "@firebase/testing";
import { getIDForPromptSpec, PromptSpecID } from "metabook-core";
import { testBasicPromptSpec } from "metabook-sample-data";
import { getDataCollectionReference } from "../firebase";
import shimFirebasePersistence from "firebase-node-persistence-shim";
import { MetabookFirebaseDataClient } from "./index";

const testProjectID = "data-client-test";
let testApp: firebase.app.App;
let dataClient: MetabookFirebaseDataClient;

beforeAll(async () => {
  await shimFirebasePersistence();
});

beforeEach(async () => {
  testApp = firebaseTesting.initializeTestApp({
    projectId: testProjectID,
  });
  await testApp.firestore().enablePersistence();

  dataClient = new MetabookFirebaseDataClient(testApp);
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
  await dataCollectionRef.doc("test").set(testBasicPromptSpec);
}

const testPromptSpecID = "test" as PromptSpecID;

describe("getData", () => {
  test("reads card data", async () => {
    await writeTestPromptData();

    const mockFn = jest.fn();
    await dataClient.getData(new Set([testPromptSpecID]), mockFn).completion;
    expect(mockFn.mock.calls[0][0]).toMatchObject(
      new Map([["test", testBasicPromptSpec]]),
    );
  });

  test("calls callback even when set of cards to read is empty", async () => {
    const mockFn = jest.fn();
    await dataClient.getData(new Set(), mockFn).completion;
    expect(mockFn).toHaveBeenCalled();
  });

  test("reads cached data", async () => {
    await writeTestPromptData();

    await testApp.firestore().disableNetwork();
    const mockFn = jest.fn();
    await dataClient.getData(new Set([testPromptSpecID]), mockFn).completion;
    expect(mockFn.mock.calls[0][0].get("test")).toBeInstanceOf(Error);

    await testApp.firestore().enableNetwork();
    mockFn.mockClear();
    await dataClient.getData(new Set([testPromptSpecID]), mockFn).completion;
    expect(mockFn.mock.calls[0][0]).toMatchObject(
      new Map([["test", testBasicPromptSpec]]),
    );

    await testApp.firestore().disableNetwork();
    mockFn.mockClear();
    await dataClient.getData(new Set([testPromptSpecID]), mockFn).completion;
    expect(mockFn.mock.calls[0][0]).toMatchObject(
      new Map([["test", testBasicPromptSpec]]),
    );
  });
});

test.skip("records prompt spec", async () => {
  await dataClient.recordData([testBasicPromptSpec]);
  const testPromptID = getIDForPromptSpec(testBasicPromptSpec);
  const mockFn = jest.fn();
  await dataClient.getData(new Set([testPromptID]), mockFn).completion;
  expect(mockFn.mock.calls[0][0].get(testPromptID)).toBeInstanceOf(Error);
  // TODO test recording new prompts when the network is down
});
