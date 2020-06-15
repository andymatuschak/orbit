import { MetabookUserClient } from "metabook-client";
import promptStateInitialImportOperation, {
  CancelledError,
} from "./promptStateInitialImportOperation";
import PromptStateStore from "./promptStateStore";

const userClient = {} as MetabookUserClient;
const promptStateStore = {} as PromptStateStore;
promptStateStore.setHasFinishedInitialImport = jest
  .fn()
  .mockResolvedValue(undefined);
promptStateStore.savePromptStateCaches = jest.fn().mockResolvedValue(undefined);
promptStateStore.getLatestLogServerTimestamp = jest
  .fn()
  .mockResolvedValue(null);

afterEach(() => {
  jest.clearAllMocks();
});

test("basic run", async () => {
  userClient.getPromptStates = jest.fn().mockImplementation(async () => {
    userClient.getPromptStates = jest.fn().mockResolvedValue([]);
    return [{}];
  });
  await promptStateInitialImportOperation(userClient, promptStateStore)
    .completion;
  expect(promptStateStore.savePromptStateCaches).toHaveBeenCalledTimes(1);
  expect(promptStateStore.setHasFinishedInitialImport).toHaveBeenCalledTimes(1);
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
  const { completion, cancel } = promptStateInitialImportOperation(
    userClient,
    promptStateStore,
  );
  cancel();
  expect(completion).rejects.toBeInstanceOf(CancelledError);
  expect(promptStateStore.savePromptStateCaches).toHaveBeenCalledTimes(0);
});
