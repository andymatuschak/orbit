import { MetabookUserClient } from "metabook-client";
import {
  applyActionLogToPromptState,
  BasicPromptTaskParameters,
  basicPromptType,
  getActionLogFromPromptActionLog,
  getIDForActionLog,
  getIDForPromptTask,
  ingestActionLogType,
  PromptID,
  PromptIngestActionLog,
  PromptRepetitionActionLog,
  PromptRepetitionOutcome,
  PromptState,
  PromptTaskID,
  repetitionActionLogType,
} from "metabook-core";
import ActionLogStore from "./actionLogStore";
import PromptStateClient, {
  computeSubscriberUpdate,
  PromptStateClientUpdate,
} from "./promptStateClient";
import PromptStateStore from "./promptStateStore";

export function promiseForNextCall<Y>(fn: jest.Mock): Promise<Y> {
  return new Promise((resolve) => fn.mockImplementation(resolve));
}

describe("computeSubscriberUpdate", () => {
  const mockSubscriber = {
    onUpdate: jest.fn(),
    dueThresholdMillis: 1000,
  };
  const testTaskID = "x" as PromptTaskID;

  test("generates added event when a prompt state is added", () => {
    const testPromptState = { dueTimestampMillis: 500 } as PromptState;
    const updates = computeSubscriberUpdate(mockSubscriber, [
      {
        taskID: testTaskID,
        oldPromptState: null,
        newPromptState: testPromptState,
      },
    ]);
    expect(updates.addedEntries).toMatchObject(
      new Map([[testTaskID, testPromptState]]),
    );
    expect(updates.updatedEntries.size).toEqual(0);
    expect(updates.removedEntries.size).toEqual(0);
  });

  test("generates added event when a prompt becomes due", () => {
    const updates = computeSubscriberUpdate(mockSubscriber, [
      {
        taskID: testTaskID,
        oldPromptState: { dueTimestampMillis: 2000 } as PromptState,
        newPromptState: { dueTimestampMillis: 500 } as PromptState,
      },
    ]);
    expect(updates.addedEntries.size).toEqual(1);
    expect(updates.updatedEntries.size).toEqual(0);
    expect(updates.removedEntries.size).toEqual(0);
  });

  test("does not generate added event when a not-yet-due prompt is added", () => {
    const updates = computeSubscriberUpdate(mockSubscriber, [
      {
        taskID: testTaskID,
        oldPromptState: null,
        newPromptState: { dueTimestampMillis: 2000 } as PromptState,
      },
    ]);
    expect(updates.addedEntries.size).toEqual(0);
    expect(updates.updatedEntries.size).toEqual(0);
    expect(updates.removedEntries.size).toEqual(0);
  });

  test("generates changed event when a due prompt changes", () => {
    const updates = computeSubscriberUpdate(mockSubscriber, [
      {
        taskID: testTaskID,
        oldPromptState: { dueTimestampMillis: 1000 } as PromptState,
        newPromptState: { dueTimestampMillis: 500 } as PromptState,
      },
    ]);
    expect(updates.addedEntries.size).toEqual(0);
    expect(updates.updatedEntries.size).toEqual(1);
    expect(updates.removedEntries.size).toEqual(0);
  });

  test("does not generate changed event when a not-yet-due prompt changes", () => {
    const updates = computeSubscriberUpdate(mockSubscriber, [
      {
        taskID: testTaskID,
        oldPromptState: { dueTimestampMillis: 3000 } as PromptState,
        newPromptState: { dueTimestampMillis: 2000 } as PromptState,
      },
    ]);
    expect(updates.addedEntries.size).toEqual(0);
    expect(updates.updatedEntries.size).toEqual(0);
    expect(updates.removedEntries.size).toEqual(0);
  });

  test("does not generate changed event when a due identical prompt state remains the same", () => {
    const testPromptState = { dueTimestampMillis: 1000 } as PromptState;
    const updates = computeSubscriberUpdate(mockSubscriber, [
      {
        taskID: testTaskID,
        oldPromptState: testPromptState,
        newPromptState: testPromptState,
      },
    ]);
    expect(updates.addedEntries.size).toEqual(0);
    expect(updates.updatedEntries.size).toEqual(0);
    expect(updates.removedEntries.size).toEqual(0);
  });

  test("generates removed event when a due prompt becomes no longer due", () => {
    const updates = computeSubscriberUpdate(mockSubscriber, [
      {
        taskID: testTaskID,
        oldPromptState: { dueTimestampMillis: 500 } as PromptState,
        newPromptState: { dueTimestampMillis: 2000 } as PromptState,
      },
    ]);
    expect(updates.addedEntries.size).toEqual(0);
    expect(updates.updatedEntries.size).toEqual(0);
    expect(updates.removedEntries.size).toEqual(1);
  });
});

// TODO: test nothing happens for identical updates

describe("prompt state subscriptions", () => {
  let promptStateStore: PromptStateStore;
  let actionLogStore: ActionLogStore;
  let remoteClient: MetabookUserClient;
  let promptStateClient: PromptStateClient;

  beforeEach(() => {
    promptStateStore = {} as PromptStateStore;
    actionLogStore = {} as ActionLogStore;
    remoteClient = {} as MetabookUserClient;
    remoteClient.subscribeToActionLogs = jest.fn(() => () => {
      return;
    });
    promptStateClient = new PromptStateClient(
      remoteClient,
      promptStateStore,
      actionLogStore,
    );
  });

  test("fetches remote states when none are cached", async () => {
    actionLogStore.getLatestServerTimestamp = jest.fn().mockResolvedValue(null);
    promptStateStore.savePromptStateCaches = jest.fn();
    remoteClient.getDuePromptStates = jest.fn().mockResolvedValue([{}]);

    const callbackMock = jest.fn();
    const callbackPromise = promiseForNextCall(callbackMock);
    const unsubscribe = promptStateClient.subscribeToDuePromptStates(
      1000,
      callbackMock,
    );
    await callbackPromise;

    expect(callbackMock.mock.calls[0][0].addedEntries.size).toEqual(1);
    expect(promptStateStore.savePromptStateCaches).toHaveBeenCalled();
    unsubscribe();
  });

  test("uses cached states when available", async () => {
    actionLogStore.getLatestServerTimestamp = jest.fn().mockResolvedValue(0);
    promptStateStore.getDuePromptStates = jest
      .fn()
      .mockResolvedValue(new Map([["x", {}]]));

    const callbackMock = jest.fn();
    const callbackPromise = promiseForNextCall(callbackMock);
    const unsubscribe = promptStateClient.subscribeToDuePromptStates(
      1000,
      callbackMock,
    );
    await callbackPromise;

    expect(callbackMock.mock.calls[0][0].addedEntries.size).toEqual(1);
    expect(promptStateStore.getDuePromptStates).toHaveBeenCalled();
    unsubscribe();
  });

  test("uses cached states when available", async () => {
    actionLogStore.getLatestServerTimestamp = jest.fn().mockResolvedValue(0);
    promptStateStore.getDuePromptStates = jest
      .fn()
      .mockResolvedValue(new Map([["x", {}]]));

    const callbackMock = jest.fn();
    const callbackPromise = promiseForNextCall(callbackMock);
    const unsubscribe = promptStateClient.subscribeToDuePromptStates(
      1000,
      callbackMock,
    );
    await callbackPromise;

    expect(callbackMock.mock.calls[0][0].addedEntries.size).toEqual(1);
    expect(promptStateStore.getDuePromptStates).toHaveBeenCalled();
    unsubscribe();
  });

  describe("updating based on logs", () => {
    const testPromptTaskID = getIDForPromptTask({
      promptParameters: null,
      promptType: basicPromptType,
      promptID: "x" as PromptID,
    });
    const testIngestLog: PromptIngestActionLog = {
      actionLogType: ingestActionLogType,
      provenance: null,
      taskID: testPromptTaskID,
      timestampMillis: 0,
    };
    const initialPromptState = applyActionLogToPromptState({
      basePromptState: null,
      promptActionLog: testIngestLog,
      schedule: "default",
    }) as PromptState;
    const testIngestLogID = getIDForActionLog(
      getActionLogFromPromptActionLog(testIngestLog),
    );
    const repetitionLog: PromptRepetitionActionLog<BasicPromptTaskParameters> = {
      actionLogType: repetitionActionLogType,
      taskID: testPromptTaskID,
      timestampMillis: initialPromptState.dueTimestampMillis,
      taskParameters: null,
      parentActionLogIDs: [testIngestLogID],
      outcome: PromptRepetitionOutcome.Remembered,
      context: null,
    };

    beforeEach(() => {
      actionLogStore.getLatestServerTimestamp = jest
        .fn()
        .mockResolvedValue({ seconds: 0, nanoseconds: 0 });
      actionLogStore.saveActionLogs = jest.fn();
      actionLogStore.getActionLogsByTaskID = jest
        .fn()
        .mockResolvedValue([testIngestLog]);
      promptStateStore.getDuePromptStates = jest
        .fn()
        .mockResolvedValue(new Map());
      promptStateStore.getPromptState = jest
        .fn()
        .mockResolvedValue(initialPromptState);
      promptStateStore.savePromptStateCaches = jest.fn();
    });

    describe("recording local logs", () => {
      beforeEach(() => {
        remoteClient.recordActionLogs = jest.fn();
      });

      test("notifies subscribers when recording local log", async () => {
        const callbackMock = jest.fn();
        let callbackPromise = promiseForNextCall(callbackMock);
        const unsubscribe = promptStateClient.subscribeToDuePromptStates(
          initialPromptState.dueTimestampMillis,
          callbackMock,
        );
        await callbackPromise;

        callbackPromise = promiseForNextCall(callbackMock);
        await promptStateClient.recordPromptActionLogs([repetitionLog]);
        const update = (await callbackPromise) as PromptStateClientUpdate;

        expect(update.removedEntries.size).toEqual(1);
        expect(promptStateStore.savePromptStateCaches).toHaveBeenCalled();
        expect(actionLogStore.saveActionLogs).toHaveBeenCalled();
        expect(remoteClient.recordActionLogs).toHaveBeenCalled();
        unsubscribe();
      });

      test("doesn't notify unsubscribed subscribers", async () => {
        const callbackMock = jest.fn();
        const unsubscribe = promptStateClient.subscribeToDuePromptStates(
          initialPromptState.dueTimestampMillis,
          callbackMock,
        );
        unsubscribe();
        await promptStateClient.recordPromptActionLogs([repetitionLog]);
        expect(callbackMock).not.toHaveBeenCalled();
      });
    });

    describe("remote logs", () => {
      test("notifies subscribers when new remote log arrives", async () => {
        remoteClient.subscribeToActionLogs = jest.fn((t, callback) => {
          if (t?.seconds === 0) {
            callback([
              {
                log: repetitionLog,
                serverTimestamp: { seconds: 10, nanoseconds: 0 },
              },
            ]);
          }
          return () => {
            return;
          };
        });

        const callbackMock = jest.fn();
        let callbackPromise = promiseForNextCall(callbackMock);
        const unsubscribe = promptStateClient.subscribeToDuePromptStates(
          initialPromptState.dueTimestampMillis,
          callbackMock,
        );
        await callbackPromise; // first update will be the initial prompt states

        // second update should get the repetition log
        callbackPromise = promiseForNextCall(callbackMock);
        const update = (await callbackPromise) as PromptStateClientUpdate;
        expect(update.removedEntries.size).toEqual(1);
        expect(promptStateStore.savePromptStateCaches).toHaveBeenCalled();
        expect(actionLogStore.saveActionLogs).toHaveBeenCalled();
        unsubscribe();
      });
    });
  });
});
