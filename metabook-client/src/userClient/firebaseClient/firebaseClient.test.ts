import * as firebaseTesting from "@firebase/testing";
import firebase from "firebase/app";
import { encodePromptTask, PromptID, PromptTask } from "metabook-core";
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
  jest.spyOn(Math, "random").mockReturnValue(0.25);
  const { newPromptState, testPromptTaskID } = recordTestPromptStateUpdate(
    client,
  );
  expect(newPromptState).toMatchInlineSnapshot(`
    Object {
      "bestInterval": 0,
      "dueTimestampMillis": 432001000,
      "interval": 432000000,
      "needsRetry": false,
      "taskParameters": null,
    }
  `);

  const updatedPromptStates = await secondMockCall;
  expect(updatedPromptStates).toMatchObject(
    new Map([[testPromptTaskID, newPromptState]]),
  );

  // The new prompt states should be a different object.
  expect(updatedPromptStates).not.toMatchObject(initialPromptStates);

  unsubscribe();
});

describe("ingesting prompt specs", () => {
  test("ingesting a basic prompt spec", async () => {
    const promptTask: PromptTask = {
      promptID: "test" as PromptID,
      promptParameters: null,
    };
    await client.recordActionLogs([
      {
        actionLogType: "ingest",
        ...promptTask,
        timestamp: firebase.firestore.Timestamp.fromMillis(Date.UTC(2020, 0)),
      },
    ]);
    const cardStates = await client.getPromptStates({});
    expect(cardStates.get(encodePromptTask(promptTask))).toMatchInlineSnapshot(`
      Object {
        "bestInterval": null,
        "dueTimestampMillis": 1578268800000,
        "interval": 432000000,
        "needsRetry": false,
        "taskParameters": null,
      }
    `);
  });

  test("ingesting a cloze prompt", async () => {
    const prompt: PromptTask = {
      promptID: "test" as PromptID,
      promptParameters: { clozeIndex: 2 },
    };
    await client.recordActionLogs([
      {
        actionLogType: "ingest",
        ...prompt,
        timestamp: firebase.firestore.Timestamp.fromMillis(Date.UTC(2020, 0)),
      },
    ]);
    const cardStates = await client.getPromptStates({});
    expect(cardStates.get(encodePromptTask(prompt))).toMatchInlineSnapshot(`
      Object {
        "bestInterval": null,
        "dueTimestampMillis": 1578268800000,
        "interval": 432000000,
        "needsRetry": false,
        "taskParameters": null,
      }
    `);
  });
});

test("port logs from local client", async () => {
  const localClient = new MetabookLocalUserClient();
  recordTestPromptStateUpdate(localClient);
  const {
    newPromptState,
    commit,
    testPromptTaskID,
  } = recordTestPromptStateUpdate(localClient);
  await commit;

  await client.recordActionLogs(localClient.getAllLogs());
  const cardStates = await client.getPromptStates({});
  expect(cardStates.get(testPromptTaskID)).toMatchObject(newPromptState);
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
