import { MetabookUserClient } from "metabook-client";
import actionLogInitialImportOperation from "./actionLogInitialImportOperation";
import ActionLogStore from "./actionLogStore";

const userClient = {} as MetabookUserClient;
const actionLogStore = {} as ActionLogStore;

afterEach(() => {
  jest.clearAllMocks();
});

test("basic run", async () => {
  const testLog = {};
  userClient.getActionLogs = jest.fn().mockImplementation(async () => {
    userClient.getActionLogs = jest.fn().mockResolvedValue([]);
    return [testLog];
  });
  actionLogStore.saveActionLogs = jest.fn();
  await actionLogInitialImportOperation(userClient, actionLogStore, {
    seconds: 100,
    nanoseconds: 0,
  }).promise;
  expect(actionLogStore.saveActionLogs).toHaveBeenCalledTimes(1);
  expect(actionLogStore.saveActionLogs).toHaveBeenCalledWith([testLog]);
});
