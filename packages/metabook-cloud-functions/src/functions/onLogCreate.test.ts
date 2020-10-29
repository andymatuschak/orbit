import { MetabookFirebaseUserClient } from "metabook-client";
import {
  getIDForPrompt,
  getIDForPromptTask,
  ingestActionLogType,
  PromptIngestActionLog,
  PromptTask,
  qaPromptType,
} from "metabook-core";
import { getTaskStateCacheReference } from "metabook-firebase-support";
import * as FirebaseTesting from "metabook-firebase-support/dist/firebaseTesting";
import { testQAPrompt } from "metabook-sample-data";

let testFirestore: ReturnType<
  typeof FirebaseTesting.createTestFirebaseApp
>["firestore"];

const testUserID = "test";
beforeEach(async () => {
  const { firestore } = FirebaseTesting.createTestFirebaseApp(testUserID);
  testFirestore = firestore;
});

afterEach(async () => {
  await FirebaseTesting.resetTestFirestore(testFirestore);
});

// TODO: re-enable integration tests after fixing andymatuschak/metabook#138 metabook-cloud-functions tests need to mock logging and emailing functions.
test.skip("updates prompt state when writing log", async () => {
  const qaPromptID = await getIDForPrompt(testQAPrompt);
  const promptTask: PromptTask = {
    promptID: qaPromptID,
    promptParameters: null,
    promptType: qaPromptType,
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
  const documentReference = await getTaskStateCacheReference(
    testAdminFirestore,
    testUserID,
    promptTaskID,
  );

  await new Promise((resolve, reject) => {
    const unsubscribe = documentReference.onSnapshot((snapshot) => {
      if (snapshot.exists) {
        unsubscribe();
        resolve();
      }
    }, reject);
  });
});
