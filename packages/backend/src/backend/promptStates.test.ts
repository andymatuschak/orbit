import {
  ActionLogID,
  getIDForPrompt,
  getIDForPromptTask,
  PromptRepetitionOutcome,
  PromptTaskID,
  qaPromptType,
  repetitionActionLogType,
} from "@withorbit/core";
import { testQAPrompt } from "@withorbit/sample-data";
import firebase from "firebase-admin";
import { ActionLogDocument, PromptStateCache } from "./firebaseSupport";
import {
  _getActiveTaskCountDelta,
  _applyActionLogDocumentToPromptStateCache,
} from "./promptStates";

let promptTaskID: PromptTaskID;
beforeAll(async () => {
  promptTaskID = getIDForPromptTask({
    promptID: await getIDForPrompt(testQAPrompt),
    promptParameters: null,
    promptType: qaPromptType,
  });
});

function createRepetitionLog(
  parentActionLogIDs: ActionLogID[],
  serverTimestamp: firebase.firestore.Timestamp,
): ActionLogDocument {
  return {
    actionLogType: repetitionActionLogType,
    timestampMillis: 100,
    parentActionLogIDs,
    taskID: promptTaskID,
    taskParameters: null,
    context: null,
    outcome: PromptRepetitionOutcome.Remembered,
    serverTimestamp,
  };
}

describe("timestamp updates", () => {
  let firstRepetition: ActionLogDocument;
  let initialPromptState: PromptStateCache;
  beforeAll(async () => {
    firstRepetition = createRepetitionLog(
      [],
      new firebase.firestore.Timestamp(1000, 0),
    );

    initialPromptState = (await _applyActionLogDocumentToPromptStateCache({
      actionLogDocument: firstRepetition,
      basePromptStateCache: null,
      fetchAllActionLogDocumentsForTask: jest.fn(),
    })) as PromptStateCache;
  });

  test("updates to newer timestamp", async () => {
    const newPromptState = (await _applyActionLogDocumentToPromptStateCache({
      actionLogDocument: createRepetitionLog(
        [],
        new firebase.firestore.Timestamp(2000, 0),
      ),
      basePromptStateCache: initialPromptState,
      fetchAllActionLogDocumentsForTask: jest.fn(),
    })) as PromptStateCache;
    expect(newPromptState.latestLogServerTimestamp.seconds).toEqual(2000);
  });

  test("doesn't update for older timestamps", async () => {
    const newPromptState = (await _applyActionLogDocumentToPromptStateCache({
      actionLogDocument: createRepetitionLog(
        [],
        new firebase.firestore.Timestamp(500, 0),
      ),
      basePromptStateCache: initialPromptState,
      fetchAllActionLogDocumentsForTask: jest.fn(),
    })) as PromptStateCache;
    expect(newPromptState.latestLogServerTimestamp.seconds).toEqual(1000);
  });
});

describe("_getActiveTaskCountDelta", () => {
  const basePromptStateCache = {
    taskMetadata: { isDeleted: false },
  } as PromptStateCache;
  const deletedPromptStateCache = {
    taskMetadata: { isDeleted: true },
  } as PromptStateCache;

  test("deleting a prompt", () => {
    expect(
      _getActiveTaskCountDelta(basePromptStateCache, deletedPromptStateCache),
    ).toBe(-1);
  });

  test("inserting a new task", () => {
    expect(_getActiveTaskCountDelta(null, basePromptStateCache)).toBe(1);
  });

  test("inserting a new deleted task", () => {
    expect(_getActiveTaskCountDelta(null, deletedPromptStateCache)).toBe(0);
  });

  test("updating an existing task", () => {
    expect(
      _getActiveTaskCountDelta(basePromptStateCache, {
        ...basePromptStateCache,
      }),
    ).toBe(0);
  });
});
