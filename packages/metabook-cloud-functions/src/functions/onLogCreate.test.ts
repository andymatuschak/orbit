import * as FirebaseTesting from "metabook-firebase-support/dist/firebaseTesting";
import { MetabookFirebaseUserClient } from "metabook-client";
import {
  basicPromptType,
  getIDForPrompt,
  getIDForPromptTask,
  ingestActionLogType,
  PromptIngestActionLog,
  PromptTask,
} from "metabook-core";
import { getTaskStateCacheReferenceForTaskID } from "metabook-firebase-support";
import { testBasicPrompt } from "metabook-sample-data";

let testFirestore: firebase.firestore.Firestore;

beforeEach(async () => {
  const { firestore } = FirebaseTesting.createTestFirebaseApp();
  testFirestore = firestore;
});

afterEach(async () => {
  FirebaseTesting.resetTestFirestore(testFirestore);
});

test.skip("updates prompt state", async () => {
  const testUserID = "test";

  const basicPromptID = getIDForPrompt(testBasicPrompt);
  const promptTask: PromptTask = {
    promptID: basicPromptID,
    promptParameters: null,
    promptType: basicPromptType,
  };
  const promptTaskID = getIDForPromptTask(promptTask);

  const userClient = new MetabookFirebaseUserClient(testFirestore, testUserID);
  const ingestLog: PromptIngestActionLog = {
    actionLogType: ingestActionLogType,
    provenance: null,
    timestampMillis: Date.now(),
    taskID: promptTaskID,
  };
  await userClient.recordActionLogs([ingestLog]);

  const {
    firestore: testAdminFirestore,
  } = FirebaseTesting.createTestAdminFirebaseApp();
  const collectionReference = getTaskStateCacheReferenceForTaskID(
    testAdminFirestore,
    testUserID,
    promptTaskID,
  );

  return new Promise((reject, resolve) => {
    const unsubscribe = collectionReference.onSnapshot((snapshot) => {
      if (snapshot.exists) {
        unsubscribe();
        resolve();
      }
    });
  });
});
