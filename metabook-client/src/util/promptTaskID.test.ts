import { getIDForPromptSpec, PromptTask } from "metabook-core";
import {
  testApplicationPromptSpec,
  testBasicPromptSpec,
  testClozePromptGroupSpec,
} from "metabook-sample-data";
import { getIDForPromptTask, getPromptIDForPromptTaskID } from "./promptTaskID";

describe("prompt task IDs", () => {
  test("task IDs for basic tasks", () => {
    const promptTask: PromptTask = { spec: testBasicPromptSpec };
    const taskID = getIDForPromptTask(promptTask);
    expect(taskID).toMatchObject({
      promptSpecID: getIDForPromptSpec(promptTask.spec),
      promptSpecType: promptTask.spec.promptSpecType,
    });
  });

  test("task IDs for application prompts", () => {
    const promptTask: PromptTask = {
      spec: testApplicationPromptSpec,
      variantIndex: 3,
    };
    const taskID = getIDForPromptTask(promptTask);
    expect(taskID).toMatchObject({
      promptSpecID: getIDForPromptSpec(promptTask.spec),
      promptSpecType: promptTask.spec.promptSpecType,
      variantIndex: 3,
    });
  });

  test("task IDs for cloze groups", () => {
    const promptTask: PromptTask = {
      spec: testClozePromptGroupSpec,
      clozeIndex: 3,
    };
    const taskID = getIDForPromptTask(promptTask);
    expect(taskID).toMatchObject({
      promptSpecID: getIDForPromptSpec(promptTask.spec),
      promptSpecType: promptTask.spec.promptSpecType,
      clozeIndex: 3,
    });
  });
});

describe("extracting prompt IDs from prompt task IDs", () => {
  test("prompt ID for a basic prompt task", () => {
    const promptTask = { spec: testBasicPromptSpec };
    const promptTaskID = getIDForPromptTask(promptTask);
    expect(getPromptIDForPromptTaskID(promptTaskID)).toMatchObject({
      promptSpecID: promptTaskID.promptSpecID,
      childIndex: null,
    });
  });

  test("prompt ID for an application prompt task", () => {
    const promptTask = { spec: testApplicationPromptSpec, variantIndex: 7 };
    const promptTaskID = getIDForPromptTask(promptTask);
    expect(getPromptIDForPromptTaskID(promptTaskID)).toMatchObject({
      promptSpecID: promptTaskID.promptSpecID,
      childIndex: null,
    });
  });

  test("prompt ID for a cloze group taskID", () => {
    const promptTask = { spec: testClozePromptGroupSpec, clozeIndex: 4 };
    const promptTaskID = getIDForPromptTask(promptTask);
    expect(getPromptIDForPromptTaskID(promptTaskID)).toMatchObject({
      promptSpecID: promptTaskID.promptSpecID,
      childIndex: 4,
    });
  });
});
