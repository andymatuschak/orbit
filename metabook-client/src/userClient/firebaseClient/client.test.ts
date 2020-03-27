import * as firebaseTesting from "@firebase/testing";
import { promiseForNextCall } from "../../util/tests/promiseForNextCall";
import { recordTestCardStateUpdate } from "../../util/tests/recordTestCardStateUpdate";
import { MetabookLocalUserClient } from "../localClient/client";
import { MetabookFirebaseUserClient } from "./client";

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

test("recording a marking triggers card state update", async () => {
  const mockFunction = jest.fn();
  const firstMockCall = promiseForNextCall(mockFunction);
  const unsubscribe = client.subscribeToCardStates(
    {},
    mockFunction,
    (error) => {
      fail(error);
    },
  );
  await firstMockCall;
  expect(mockFunction).toHaveBeenCalledWith({});

  const secondMockCall = promiseForNextCall(mockFunction);
  jest.spyOn(Math, "random").mockReturnValue(0.25);
  const { newCardState } = recordTestCardStateUpdate(client, "test");
  expect(newCardState).toMatchInlineSnapshot(`
    Object {
      "bestInterval": 0,
      "dueTimestampMillis": 432001000,
      "interval": 432000000,
      "needsRetry": false,
      "orderSeed": 0.25,
    }
  `);

  const updatedCardStates = await secondMockCall;
  expect(updatedCardStates).toMatchObject({
    test: newCardState,
  });

  unsubscribe();
});

test("port logs from local client", async () => {
  const localClient = new MetabookLocalUserClient();
  recordTestCardStateUpdate(localClient, "test");
  const { newCardState, commit } = recordTestCardStateUpdate(
    localClient,
    "test",
  );
  await commit;

  await client.recordActionLogs(localClient.getAllLogs());
  const cardStates = await client.getCardStates({});
  expect(cardStates["test"]).toMatchObject(newCardState);
});

test("getCardStates changes after recording update", async () => {
  const initialCardStates = await client.getCardStates({});
  recordTestCardStateUpdate(client, "test");
  const finalCardStates = await client.getCardStates({});
  expect(initialCardStates).not.toMatchObject(finalCardStates);
});

test("no events after unsubscribing", async () => {
  const mockFunction = jest.fn();
  const firstMockCall = promiseForNextCall(mockFunction);
  const unsubscribe = client.subscribeToCardStates({}, mockFunction, jest.fn());
  await firstMockCall;
  mockFunction.mockClear();

  unsubscribe();

  await recordTestCardStateUpdate(client, "test").commit;
  expect(mockFunction).not.toHaveBeenCalled();
});

describe("security rules", () => {
  let anotherClient: MetabookFirebaseUserClient;
  beforeEach(() => {
    anotherClient = new MetabookFirebaseUserClient(testApp, "anotherUser");
  });

  test("can't read cards from another user", async () => {
    await recordTestCardStateUpdate(client, "test").commit;
    await expect(anotherClient.getCardStates({})).rejects.toBeInstanceOf(Error);
  });

  test("can't write cards to another user", async () => {
    await expect(
      recordTestCardStateUpdate(anotherClient, "test").commit,
    ).rejects.toBeInstanceOf(Error);
  });
});
