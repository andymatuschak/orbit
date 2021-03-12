import OrbitAPIClient from "@withorbit/api-client";
import { CancelledError } from "../util/task";
import promptStateInitialImportOperation from "./promptStateInitialImportOperation";
import PromptStateStore from "./promptStateStore";

const apiClient = {} as OrbitAPIClient;
const promptStateStore = {} as PromptStateStore;
promptStateStore.savePromptStates = jest.fn().mockResolvedValue(undefined);

afterEach(() => {
  jest.clearAllMocks();
});

test("basic run", async () => {
  apiClient.listTaskStates = jest.fn().mockImplementation(async () => {
    apiClient.listTaskStates = jest.fn().mockResolvedValue({ data: [] });
    return { data: [{ data: {}, id: "testID" }], hasMore: false };
  });
  await promptStateInitialImportOperation(apiClient, promptStateStore).promise;
  expect(promptStateStore.savePromptStates).toHaveBeenCalledTimes(1);
});

test("canceling", async () => {
  apiClient.listTaskStates = jest.fn().mockImplementation(async () => {
    apiClient.listTaskStates = jest.fn().mockReturnValue(
      new Promise(() => {
        // intentional no-op: never resolve
        return;
      }),
    );
    return { data: [{ data: {}, id: "testID" }], hasMore: false };
  });
  const { promise, cancel } = promptStateInitialImportOperation(
    apiClient,
    promptStateStore,
  );
  cancel();
  expect(promise).rejects.toBeInstanceOf(CancelledError);
  expect(promptStateStore.savePromptStates).toHaveBeenCalledTimes(0);
});
