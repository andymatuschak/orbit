import shimFirebasePersistence from "firebase-node-persistence-shim";
import {
  basicPromptType,
  getIDForPromptTask,
  PromptID,
  PromptState,
  PromptTask,
  PromptTaskID,
} from "metabook-core";
import { ServerTimestamp } from "metabook-firebase-support";
import PromptStateStore from "./promptStateStore";

jest.mock("../util/leveldown", () => {
  const Memdown = require("memdown");
  return Memdown;
});

beforeAll(() => {
  shimFirebasePersistence();
});

let store: PromptStateStore;
beforeEach(() => {
  store = new PromptStateStore();
});

afterEach(async () => {
  await store.clear();
  await store.close();
});

const testPromptState = ({
  test: true,
  dueTimestampMillis: 0,
  taskMetadata: { isDeleted: false },
} as unknown) as PromptState;

async function saveTestPromptState() {
  return await store.savePromptStates([
    {
      promptState: testPromptState,
      taskID: "x" as PromptTaskID,
    },
  ]);
}

test("round trips data", async () => {
  await saveTestPromptState();
  const record = await store.getPromptState("x" as PromptTaskID);
  expect(record).toMatchObject(testPromptState);
});

test("returns null for missing keys", async () => {
  const record = await store.getPromptState("foo" as PromptTaskID);
  expect(record).toBeNull();
});

describe("access by due timestamp", () => {
  const testTask: PromptTask = {
    promptID: "x" as PromptID,
    promptType: basicPromptType,
    promptParameters: null,
  };
  const testTaskID = getIDForPromptTask(testTask);

  test("accesses due prompts", async () => {
    await store.savePromptStates([
      {
        promptState: { ...testPromptState, dueTimestampMillis: 1000 },
        taskID: testTaskID,
      },
      {
        promptState: { ...testPromptState, dueTimestampMillis: 5000 },
        taskID: getIDForPromptTask({
          ...testTask,
          promptID: "another" as PromptID,
        }),
      },
    ]);

    expect(await store.getDuePromptStates(1000)).toMatchObject(
      new Map([[testTask, { ...testPromptState, dueTimestampMillis: 1000 }]]),
    );
  });

  test("indexed due times update when overwritten", async () => {
    await store.savePromptStates([
      {
        promptState: {
          ...testPromptState,
          dueTimestampMillis: 1000,
        },
        taskID: testTaskID,
      },
    ]);
    await store.savePromptStates([
      {
        promptState: {
          ...testPromptState,
          dueTimestampMillis: 5000,
        },
        taskID: testTaskID,
      },
    ]);

    expect(await store.getDuePromptStates(1000)).toMatchObject(new Map());
    expect((await store.getDuePromptStates(5000)).size).toEqual(1);
  });
});
