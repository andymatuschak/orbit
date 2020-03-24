import firebase from "firebase";
import * as firebaseTesting from "@firebase/testing";
import { testBasicPromptData } from "metabook-sample-data";
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
  await dataCollectionRef.doc("test").set(testBasicPromptData);
}

test("reads card data", async () => {
  await writeTestPromptData();

  const mockFn = jest.fn();
  await dataClient.getData(new Set(["test"]), mockFn).completion;
  expect(mockFn.mock.calls[0][0]).toMatchObject({ test: testBasicPromptData });
});

test("reads cached data", async () => {
  await writeTestPromptData();

  await testApp.firestore().disableNetwork();
  const mockFn = jest.fn();
  await dataClient.getData(new Set(["test"]), mockFn).completion;
  expect(mockFn.mock.calls[0][0]["test"]).toBeInstanceOf(Error);

  await testApp.firestore().enableNetwork();
  mockFn.mockClear();
  await dataClient.getData(new Set(["test"]), mockFn).completion;
  expect(mockFn.mock.calls[0][0]).toMatchObject({ test: testBasicPromptData });

  await testApp.firestore().disableNetwork();
  mockFn.mockClear();
  await dataClient.getData(new Set(["test"]), mockFn).completion;
  expect(mockFn.mock.calls[0][0]).toMatchObject({ test: testBasicPromptData });
});
