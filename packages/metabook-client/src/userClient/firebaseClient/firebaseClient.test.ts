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
import * as FirebaseTesting from "metabook-firebase-support/dist/firebaseTesting";
import { testBasicPrompt } from "metabook-sample-data";
import { promiseForNextCall } from "../../util/tests/promiseForNextCall";
import { recordTestPromptStateUpdate } from "../../util/tests/recordTestPromptStateUpdate";
import { MetabookFirebaseUserClient } from "./firebaseClient";

let testFirestore: firebase.firestore.Firestore;
let client: MetabookFirebaseUserClient;

const testUserID = "testUser";
beforeEach(() => {
  testFirestore = FirebaseTesting.createTestFirebaseApp(testUserID).firestore;
  client = new MetabookFirebaseUserClient(testFirestore, testUserID);
});

afterEach(async () => {
  return FirebaseTesting.resetTestFirestore(testFirestore);
});

test("recording a review triggers new log", async () => {
  const mockFunction = jest.fn();
  const unsubscribe = client.subscribeToActionLogs(
    {},
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
      latestLogServerTimestamp: new firebase.firestore.Timestamp(0, 0),
    });

    const initialPromptStates = await client.getPromptStates({
      dueBeforeTimestampMillis: initialPromptState.dueTimestampMillis,
    });
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
  const unsubscribe = client.subscribeToActionLogs({}, mockFunction, jest.fn());
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
    await expect(anotherClient.getPromptStates({})).rejects.toBeInstanceOf(
      Error,
    );
  });

  test("can't write cards to another user", async () => {
    await expect(
      recordTestPromptStateUpdate(anotherClient).commit,
    ).rejects.toBeInstanceOf(Error);
  });
});
