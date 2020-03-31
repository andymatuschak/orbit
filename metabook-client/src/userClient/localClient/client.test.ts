import { promiseForNextCall } from "../../util/tests/promiseForNextCall";
import { recordTestPromptStateUpdate } from "../../util/tests/recordTestPromptStateUpdate";
import { MetabookLocalUserClient } from "./client";

let client: MetabookLocalUserClient;
beforeEach(() => {
  client = new MetabookLocalUserClient();
});

test("recording a marking triggers card state update", async () => {
  const mockFunction = jest.fn();
  const firstMockCall = promiseForNextCall(mockFunction);
  client.subscribeToPromptStates({}, mockFunction, (error) => {
    fail(error);
  });
  await firstMockCall;
  expect(mockFunction).toHaveBeenCalledWith(new Map());

  const secondMockCall = promiseForNextCall(mockFunction);
  jest.spyOn(Math, "random").mockReturnValue(0.25);
  await recordTestPromptStateUpdate(client, "test");
  const updatedCardStates = await secondMockCall;
  expect(updatedCardStates).toMatchInlineSnapshot(`
    Map {
      "test" => Object {
        "bestInterval": 0,
        "dueTimestampMillis": 432001000,
        "interval": 432000000,
        "needsRetry": false,
      },
    }
  `);
});

test("getCardStates changes after recording update", async () => {
  const initialCardStates = await client.getPromptStates({});
  await recordTestPromptStateUpdate(client, "test").commit;
  const finalCardStates = await client.getPromptStates({});
  expect(initialCardStates).not.toMatchObject(finalCardStates);
});

test("logs reflect updates", () => {
  expect(client.getAllLogs()).toHaveLength(0);
  recordTestPromptStateUpdate(client, "test");
  recordTestPromptStateUpdate(client, "test");
  expect(client.getAllLogs()).toHaveLength(2);
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

  await recordTestPromptStateUpdate(client, "test").commit;
  expect(mockFunction).not.toHaveBeenCalled();
});
