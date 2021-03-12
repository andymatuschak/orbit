import OrbitAPIClient from "@withorbit/api-client";
import actionLogInitialImportOperation from "./actionLogInitialImportOperation";
import ActionLogStore from "./actionLogStore";

const userClient = {} as OrbitAPIClient;
const actionLogStore = {} as ActionLogStore;

afterEach(() => {
  jest.clearAllMocks();
});

test("basic run", async () => {
  const testLog = {};
  userClient.listActionLogs = jest.fn().mockImplementation(async () => {
    userClient.listActionLogs = jest
      .fn()
      .mockResolvedValue({ data: [], hasMore: false });
    return { data: [{ data: testLog, id: "testLogID" }], hasMore: false };
  });
  const saveActionLogsMock = jest.fn();
  actionLogStore.saveActionLogs = saveActionLogsMock;
  actionLogStore.setLatestCreatedSyncedLogID = jest.fn();
  await actionLogInitialImportOperation(userClient, actionLogStore).promise;
  expect(actionLogStore.saveActionLogs).toHaveBeenCalledTimes(1);
  expect(saveActionLogsMock.mock.calls[0][0].length).toBe(1);
});
