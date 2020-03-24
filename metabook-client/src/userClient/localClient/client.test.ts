import { promiseForNextCall } from "../../util/tests/promiseForNextCall";
import { recordTestCardStateUpdate } from "../../util/tests/recordTestCardStateUpdate";
import { MetabookLocalUserClient } from "./client";

let client: MetabookLocalUserClient;
beforeEach(() => {
  client = new MetabookLocalUserClient();
});

test("recording a marking triggers card state update", async () => {
  const mockFunction = jest.fn();
  const firstMockCall = promiseForNextCall(mockFunction);
  client.subscribeToCardStates({}, mockFunction, error => {
    fail(error);
  });
  await firstMockCall;
  expect(mockFunction).toHaveBeenCalledWith({});

  const secondMockCall = promiseForNextCall(mockFunction);
  jest.spyOn(Math, "random").mockReturnValue(0.25);
  await recordTestCardStateUpdate(client, "test");
  const updatedCardStates = await secondMockCall;
  expect(updatedCardStates).toMatchInlineSnapshot(`
    Object {
      "test": Object {
        "bestInterval": 0,
        "dueTime": 432001000,
        "interval": 432000000,
        "needsRetry": false,
        "orderSeed": 0.25,
      },
    }
  `);
});

test("getCardStates changes after recording update", async () => {
  const initialCardStates = await client.getCardStates({});
  recordTestCardStateUpdate(client, "test");
  const finalCardStates = await client.getCardStates({});
  expect(initialCardStates).not.toMatchObject(finalCardStates);
});

test("logs reflect updates", () => {
  expect(client.getAllLogs()).toHaveLength(0);
  recordTestCardStateUpdate(client, "test");
  recordTestCardStateUpdate(client, "test");
  expect(client.getAllLogs()).toHaveLength(2);
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
