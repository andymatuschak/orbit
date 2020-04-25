import shimFirebasePersistence from "firebase-node-persistence-shim";
import { PromptState, PromptTaskID } from "metabook-core";
import PromptStateStore from "./promptStateStore";

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
} as unknown) as PromptState;

async function saveTestPromptState() {
  return await store.savePromptStateCaches([
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
  test("accesses due prompts", async () => {
    const testTaskID = "x" as PromptTaskID;
    const testPromptState = { dueTimestampMillis: 1000 } as PromptState;
    await store.savePromptStateCaches([
      {
        promptState: testPromptState,
        taskID: testTaskID,
      },
      {
        promptState: { dueTimestampMillis: 5000 } as PromptState,
        taskID: "another" as PromptTaskID,
      },
    ]);

    expect(await store.getDuePromptStates(1000)).toMatchObject(
      new Map([[testTaskID, testPromptState]]),
    );
  });

  test("indexed due times update when overwritten", async () => {
    const testTaskID = "x" as PromptTaskID;
    await store.savePromptStateCaches([
      {
        promptState: { dueTimestampMillis: 1000 } as PromptState,
        taskID: testTaskID,
      },
    ]);
    await store.savePromptStateCaches([
      {
        promptState: { dueTimestampMillis: 5000 } as PromptState,
        taskID: testTaskID,
      },
    ]);

    expect(await store.getDuePromptStates(1000)).toMatchObject(new Map());
  });
});
