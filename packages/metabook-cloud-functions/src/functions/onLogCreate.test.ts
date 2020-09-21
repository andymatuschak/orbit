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
import * as FirebaseTesting from "metabook-firebase-support/dist/firebaseTesting";
import { testBasicPrompt } from "metabook-sample-data";

let testFirestore: firebase.firestore.Firestore;

const testUserID = "test";
beforeEach(async () => {
  const { firestore } = FirebaseTesting.createTestFirebaseApp(testUserID);
  testFirestore = firestore;
});

afterEach(async () => {
  await FirebaseTesting.resetTestFirestore(testFirestore);
});

test("updates prompt state when writing log", async () => {
  const basicPromptID = await getIDForPrompt(testBasicPrompt);
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

  await new Promise((resolve, reject) => {
    const unsubscribe = collectionReference.onSnapshot((snapshot) => {
      if (snapshot.exists) {
        unsubscribe();
        resolve();
      }
    }, reject);
  });
});
