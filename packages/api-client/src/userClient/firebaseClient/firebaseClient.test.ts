import firebase from "firebase/app";
import {
  applyActionLogToPromptState,
  qaPromptType,
  getIDForActionLog,
  getIDForPrompt,
  getIDForPromptTask,
  ingestActionLogType,
  PromptIngestActionLog,
  PromptState,
  PromptTask,
} from "metabook-core";
import {
  getTaskStateCacheReference,
  PromptStateCache,
} from "metabook-firebase-support";
import * as FirebaseTesting from "metabook-firebase-support/dist/firebaseTesting";
import { testQAPrompt } from "metabook-sample-data";
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
  const { testPromptActionLog } = await recordTestPromptStateUpdate(client);

  const newLogs = await mockCall;
  expect(newLogs).toMatchObject([{ log: testPromptActionLog }]);
  unsubscribe();
});

describe("prompt states", () => {
  test("initial prompt states", async () => {
    const testPromptID = await getIDForPrompt(testQAPrompt);
    const promptTask: PromptTask = {
      promptID: testPromptID,
      promptType: qaPromptType,
      promptParameters: null,
    };
    const taskID = getIDForPromptTask(promptTask);
    const ref = (await getTaskStateCacheReference(
      testFirestore,
      testUserID,
      taskID,
    )) as firebase.firestore.DocumentReference<PromptStateCache>;
    const ingestLog: PromptIngestActionLog = {
      taskID,
      actionLogType: ingestActionLogType,
      timestampMillis: 1000,
      provenance: null,
    };
    const initialPromptState = applyActionLogToPromptState({
      promptActionLog: ingestLog,
      actionLogID: await getIDForActionLog(ingestLog),
      basePromptState: null,
      schedule: "default",
    }) as PromptState;
    const timestamp = new firebase.firestore.Timestamp(0, 0);
    await ref.set({
      ...initialPromptState,
      taskID,
      latestLogServerTimestamp: timestamp,
      creationServerTimestamp: timestamp,
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
  await recordTestPromptStateUpdate(client);
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
    await recordTestPromptStateUpdate(client);
    await expect(anotherClient.getPromptStates({})).rejects.toBeInstanceOf(
      Error,
    );
  });

  test("can't write cards to another user", async () => {
    await expect(
      recordTestPromptStateUpdate(anotherClient),
    ).rejects.toBeInstanceOf(Error);
  });
});
