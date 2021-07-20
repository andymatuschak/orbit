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
import applyPromptActionLogToPromptStateCache from "./applyPromptActionLogToPromptStateCache";
import { ActionLogDocument, PromptStateCache } from "./backend/firebaseSupport";

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

describe("timestamps", () => {
  let firstRepetition: ActionLogDocument;
  let initialPromptState: PromptStateCache;
  beforeAll(async () => {
    firstRepetition = createRepetitionLog(
      [],
      new firebase.firestore.Timestamp(1000, 0),
    );

    initialPromptState = (await applyPromptActionLogToPromptStateCache({
      actionLogDocument: firstRepetition,
      basePromptStateCache: null,
      fetchAllActionLogDocumentsForTask: jest.fn(),
    })) as PromptStateCache;
  });

  test("updates to newer timestamp", async () => {
    const newPromptState = (await applyPromptActionLogToPromptStateCache({
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
    const newPromptState = (await applyPromptActionLogToPromptStateCache({
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
