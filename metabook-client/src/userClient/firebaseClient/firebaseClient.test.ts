import * as firebaseTesting from "@firebase/testing";
import firebase from "firebase/app";
import {
  applyActionLogToPromptState,
  basicPromptType,
  getIDForPrompt,
  getIDForPromptTask,
  ingestActionLogType,
  PromptIngestActionLog,
  PromptState,
  PromptTask,
} from "metabook-core";
import {
  getTaskStateCacheReferenceForTaskID,
  PromptStateCache,
} from "metabook-firebase-support";
import { testBasicPrompt } from "metabook-sample-data";
import { promiseForNextCall } from "../../util/tests/promiseForNextCall";
import { recordTestPromptStateUpdate } from "../../util/tests/recordTestPromptStateUpdate";
import { MetabookFirebaseUserClient } from "./firebaseClient";

let testFirestore: firebase.firestore.Firestore;
let client: MetabookFirebaseUserClient;

const testUserID = "testUser";
const testProjectID = "firebase-client-test";
beforeEach(() => {
  const testApp = firebaseTesting.initializeTestApp({
    projectId: testProjectID,
    auth: { uid: testUserID, email: "test@test.com" },
  });
  testFirestore = testApp.firestore();
  client = new MetabookFirebaseUserClient(testFirestore, testUserID);
});

afterEach(() => {
  return firebaseTesting.clearFirestoreData({ projectId: testProjectID });
});

test("recording a review triggers new log", async () => {
  const mockFunction = jest.fn();
  const unsubscribe = client.subscribeToActionLogs(
    null,
    mockFunction,
    (error) => {
      fail(error);
    },
  );

  const mockCall = promiseForNextCall(mockFunction);
  const { testPromptActionLog, commit } = recordTestPromptStateUpdate(client);
  await commit;

  const newLogs = await mockCall;
  expect(newLogs).toMatchObject([{ log: testPromptActionLog }]);
  unsubscribe();
});

describe("prompt states", () => {
  test("initial prompt states", async () => {
    const testPromptID = getIDForPrompt(testBasicPrompt);
    const promptTask: PromptTask = {
      promptID: testPromptID,
      promptType: basicPromptType,
      promptParameters: null,
    };
    const taskID = getIDForPromptTask(promptTask);
    const ref = getTaskStateCacheReferenceForTaskID(
      testFirestore,
      testUserID,
      taskID,
    ) as firebase.firestore.DocumentReference<PromptStateCache>;
    const ingestLog: PromptIngestActionLog = {
      taskID,
      actionLogType: ingestActionLogType,
      timestampMillis: 1000,
      provenance: null,
    };
    const initialPromptState = applyActionLogToPromptState({
      promptActionLog: ingestLog,
      basePromptState: null,
      schedule: "default",
    }) as PromptState;
    await ref.set({
      ...initialPromptState,
      taskID,
    });

    const initialPromptStates = await client.getDuePromptStates(
      initialPromptState.dueTimestampMillis,
    );
    expect(initialPromptStates).toMatchObject([
      {
        taskID,
        ...initialPromptState,
      },
    ]);
  });
});

test("no events after unsubscribing", async () => {
  const mockFunction = jest.fn();
  const unsubscribe = client.subscribeToActionLogs(
    null,
    mockFunction,
    jest.fn(),
  );
  unsubscribe();
  await recordTestPromptStateUpdate(client).commit;
  expect(mockFunction).not.toHaveBeenCalled();
});

describe("security rules", () => {
  let anotherClient: MetabookFirebaseUserClient;
  beforeEach(() => {
    anotherClient = new MetabookFirebaseUserClient(
      testFirestore,
      "anotherUser",
    );
  });

  test("can't read cards from another user", async () => {
    await recordTestPromptStateUpdate(client).commit;
    await expect(anotherClient.getDuePromptStates(1e10)).rejects.toBeInstanceOf(
      Error,
    );
  });

  test("can't write cards to another user", async () => {
    await expect(
      recordTestPromptStateUpdate(anotherClient).commit,
    ).rejects.toBeInstanceOf(Error);
  });
});
