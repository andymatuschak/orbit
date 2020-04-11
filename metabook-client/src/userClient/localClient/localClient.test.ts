import {
  applyActionLogToPromptState,
  PromptTaskID,
  PromptState,
} from "metabook-core";
import { promiseForNextCall } from "../../util/tests/promiseForNextCall";
import { recordTestPromptStateUpdate } from "../../util/tests/recordTestPromptStateUpdate";
import { MetabookLocalUserClient } from "./localClient";

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
  const {
    commit,
    testPromptActionLog,
    testPromptTaskID,
  } = recordTestPromptStateUpdate(client);
  await commit;

  const updatedCardStates = (await secondMockCall) as Map<
    PromptTaskID,
    PromptState
  >;
  expect(updatedCardStates.get(testPromptTaskID)).toMatchObject(
    applyActionLogToPromptState({
      basePromptState: null,
      promptActionLog: testPromptActionLog,
      schedule: "default",
    }),
  );
});

test("getCardStates changes after recording update", async () => {
  const initialCardStates = await client.getPromptStates({});
  await recordTestPromptStateUpdate(client).commit;
  const finalCardStates = await client.getPromptStates({});
  expect(initialCardStates).not.toMatchObject(finalCardStates);
});

test("logs reflect updates", async () => {
  expect(client.getAllLogs()).toHaveLength(0);
  await recordTestPromptStateUpdate(client).commit;
  await recordTestPromptStateUpdate(client).commit;
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

  await recordTestPromptStateUpdate(client).commit;
  expect(mockFunction).not.toHaveBeenCalled();
});
