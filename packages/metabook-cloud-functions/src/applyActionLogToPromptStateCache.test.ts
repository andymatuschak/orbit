import {
  ActionLogID,
  basicPromptType,
  getIDForPrompt,
  getIDForPromptTask,
  PromptRepetitionOutcome,
  PromptTask,
  repetitionActionLogType,
} from "metabook-core";
import {
  ActionLogDocument,
  PromptStateCache,
  ServerTimestamp,
} from "metabook-firebase-support";
import { testBasicPrompt } from "metabook-sample-data";
import applyActionLogToPromptStateCache from "./applyActionLogToPromptStateCache";

const basicPromptID = getIDForPrompt(testBasicPrompt);
const promptTask: PromptTask = {
  promptID: basicPromptID,
  promptParameters: null,
  promptType: basicPromptType,
};
const promptTaskID = getIDForPromptTask(promptTask);

function createRepetitionLog(
  parentActionLogIDs: ActionLogID[],
  serverTimestamp: ServerTimestamp,
): ActionLogDocument<ServerTimestamp> {
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
  const firstRepetition = createRepetitionLog([], {
    seconds: 1000,
    nanoseconds: 0,
  });
  const promptState = applyActionLogToPromptStateCache(
    firstRepetition,
    null,
  ) as PromptStateCache;

  test("updates to newer timestamp", () => {
    const newPromptState = applyActionLogToPromptStateCache(
      createRepetitionLog([], {
        seconds: 2000,
        nanoseconds: 0,
      }),
      promptState,
    ) as PromptStateCache;
    expect(newPromptState.latestLogServerTimestamp.seconds).toEqual(2000);
  });

  test("doesn't update for older timestamps", () => {
    const newPromptState = applyActionLogToPromptStateCache(
      createRepetitionLog([], {
        seconds: 500,
        nanoseconds: 0,
      }),
      promptState,
    ) as PromptStateCache;
    expect(newPromptState.latestLogServerTimestamp.seconds).toEqual(1000);
  });
});
