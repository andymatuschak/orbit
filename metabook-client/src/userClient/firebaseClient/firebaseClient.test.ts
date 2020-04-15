import * as firebaseTesting from "@firebase/testing";
import firebase from "firebase/app";
import {
  basicPromptType,
  clozePromptType,
  ingestActionLogType,
  PromptID,
  PromptTask,
  getIDForPromptTask,
  applyActionLogToPromptState,
} from "metabook-core";
import { promiseForNextCall } from "../../util/tests/promiseForNextCall";
import { recordTestPromptStateUpdate } from "../../util/tests/recordTestPromptStateUpdate";
import { MetabookLocalUserClient } from "../localClient";
import { MetabookFirebaseUserClient } from "./firebaseClient";

let testApp: firebase.app.App;
let client: MetabookFirebaseUserClient;

const testUserID = "testUser";
const testProjectID = "firebase-client-test";
beforeEach(() => {
  testApp = firebaseTesting.initializeTestApp({
    projectId: testProjectID,
    auth: { uid: testUserID, email: "test@test.com" },
  });
  client = new MetabookFirebaseUserClient(testApp, testUserID);
});

afterEach(() => {
  return firebaseTesting.clearFirestoreData({ projectId: testProjectID });
});

test("recording a review triggers card state update", async () => {
  const mockFunction = jest.fn();
  const firstMockCall = promiseForNextCall(mockFunction);
  const unsubscribe = client.subscribeToPromptStates(
    {},
    mockFunction,
    (error) => {
      fail(error);
    },
  );
  await firstMockCall;
  const initialPromptStates = mockFunction.mock.calls[0][0];
  expect(initialPromptStates).toMatchObject(new Map());

  const secondMockCall = promiseForNextCall(mockFunction);
  const {
    testPromptTaskID,
    testPromptActionLog,
    commit,
  } = recordTestPromptStateUpdate(client);
  await commit;

  const updatedPromptStates = await secondMockCall;
  expect(updatedPromptStates).toMatchObject(
    new Map([
      [
        testPromptTaskID,
        applyActionLogToPromptState({
          promptActionLog: testPromptActionLog,
          basePromptState: null,
          schedule: "default",
        }),
      ],
    ]),
  );

  // The new prompt states should be a different object.
  expect(updatedPromptStates).not.toMatchObject(initialPromptStates);

  unsubscribe();
});

describe("ingesting prompt specs", () => {
  test("ingesting a basic prompt spec", async () => {
    const promptTask: PromptTask = {
      promptID: "test" as PromptID,
      promptType: basicPromptType,
      promptParameters: null,
    };
    await client.recordActionLogs([
      {
        actionLogType: ingestActionLogType,
        taskID: getIDForPromptTask(promptTask),
        timestampMillis: Date.UTC(2020, 0),
        metadata: null,
      },
    ]);
    const cardStates = await client.getPromptStates({});
    expect(cardStates.get(getIDForPromptTask(promptTask))).toBeTruthy();
  });

  test("ingesting a cloze prompt", async () => {
    const promptTask: PromptTask = {
      promptID: "test" as PromptID,
      promptType: clozePromptType,
      promptParameters: { clozeIndex: 2 },
    };
    await client.recordActionLogs([
      {
        actionLogType: ingestActionLogType,
        taskID: getIDForPromptTask(promptTask),
        timestampMillis: Date.UTC(2020, 0),
        metadata: null,
      },
    ]);
    const cardStates = await client.getPromptStates({});
    expect(cardStates.get(getIDForPromptTask(promptTask))).toBeTruthy();
  });
});

test("port logs from local client", async () => {
  const localClient = new MetabookLocalUserClient();
  recordTestPromptStateUpdate(localClient);
  const { commit, testPromptTaskID } = recordTestPromptStateUpdate(localClient);
  await commit;
  const localCardStates = await localClient.getPromptStates({});
  expect(localCardStates.get(testPromptTaskID)).toBeTruthy();

  await client.recordActionLogs(localClient.getAllLogs());
  const cardStates = await client.getPromptStates({});
  expect(cardStates.get(testPromptTaskID)).toMatchObject(
    localCardStates.get(testPromptTaskID)!,
  );
});

test("getCardStates changes after recording update", async () => {
  const initialCardStates = await client.getPromptStates({});
  await recordTestPromptStateUpdate(client).commit;
  const finalCardStates = await client.getPromptStates({});
  expect(initialCardStates).not.toMatchObject(finalCardStates);
});

test("no events after unsubscribing", async () => {
  const mockFunction = jest.fn();
  const firstMockCall = promiseForNextCall(mockFunction);
  const unsubscribe = client.subscribeToPromptStates(
    {},
    mockFunction,
    jest.fn(),
  );
  await firstMockCall;
  mockFunction.mockClear();

  unsubscribe();

  await recordTestPromptStateUpdate(client).commit;
  expect(mockFunction).not.toHaveBeenCalled();
});

describe("security rules", () => {
  let anotherClient: MetabookFirebaseUserClient;
  beforeEach(() => {
    anotherClient = new MetabookFirebaseUserClient(testApp, "anotherUser");
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
