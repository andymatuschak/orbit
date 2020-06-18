import { MetabookUserClient } from "metabook-client";
import { CancelledError } from "../util/task";
import promptStateInitialImportOperation from "./promptStateInitialImportOperation";
import PromptStateStore from "./promptStateStore";

const userClient = {} as MetabookUserClient;
const promptStateStore = {} as PromptStateStore;
promptStateStore.savePromptStates = jest.fn().mockResolvedValue(undefined);

afterEach(() => {
  jest.clearAllMocks();
});

test("basic run", async () => {
  userClient.getPromptStates = jest.fn().mockImplementation(async () => {
    userClient.getPromptStates = jest.fn().mockResolvedValue([]);
    return [{}];
  });
  await promptStateInitialImportOperation(userClient, promptStateStore).promise;
  expect(promptStateStore.savePromptStates).toHaveBeenCalledTimes(1);
});

test("canceling", async () => {
  userClient.getPromptStates = jest.fn().mockImplementation(async () => {
    userClient.getPromptStates = jest.fn().mockReturnValue(
      new Promise(() => {
        // intentional no-op: never resolve
        return;
      }),
    );
    return [{}];
  });
  const { promise, cancel } = promptStateInitialImportOperation(
    userClient,
    promptStateStore,
  );
  cancel();
  expect(promise).rejects.toBeInstanceOf(CancelledError);
  expect(promptStateStore.savePromptStates).toHaveBeenCalledTimes(0);
});
