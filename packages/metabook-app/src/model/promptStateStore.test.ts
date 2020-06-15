import shimFirebasePersistence from "firebase-node-persistence-shim";
import { PromptState, PromptTaskID } from "metabook-core";
import { PromptStateCache, ServerTimestamp } from "metabook-firebase-support";
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

const testServerTimestamp: ServerTimestamp = { seconds: 0, nanoseconds: 100 };

const testPromptState = ({
  test: true,
  dueTimestampMillis: 0,
  taskMetadata: { isDeleted: false },
} as unknown) as PromptState;

const testPromptStateCache: PromptStateCache = {
  ...testPromptState,
  taskID: "x" as PromptTaskID,
  latestLogServerTimestamp: testServerTimestamp,
};

async function saveTestPromptState() {
  return await store.savePromptStateCaches([
    {
      ...testPromptStateCache,
      taskID: "x" as PromptTaskID,
    },
  ]);
}

test("round trips data", async () => {
  await saveTestPromptState();
  const record = await store.getPromptState("x" as PromptTaskID);
  expect(record).toMatchObject(testPromptState);
});

describe("latest server timestamp cache", () => {
  test("sets latest server timestamp", async () => {
    await saveTestPromptState();
    expect(await store.getLatestLogServerTimestamp()).toMatchObject(
      testServerTimestamp,
    );
  });

  test("updates with newer server timestamp", async () => {
    await saveTestPromptState();
    const testTimestamp = { seconds: 10, nanoseconds: 0 };
    await store.savePromptStateCaches([
      {
        ...testPromptStateCache,
        latestLogServerTimestamp: testTimestamp,
        taskID: "x" as PromptTaskID,
      },
    ]);
    expect(await store.getLatestLogServerTimestamp()).toMatchObject(
      testTimestamp,
    );
  });

  test("doesn't update with older server timestamp", async () => {
    await saveTestPromptState();
    await store.savePromptStateCaches([
      {
        ...testPromptStateCache,
        latestLogServerTimestamp: { seconds: 0, nanoseconds: 1 },
        taskID: "x" as PromptTaskID,
      },
    ]);
    expect(await store.getLatestLogServerTimestamp()).toMatchObject(
      testServerTimestamp,
    );
  });
});

test("returns null for missing keys", async () => {
  const record = await store.getPromptState("foo" as PromptTaskID);
  expect(record).toBeNull();
});

describe("access by due timestamp", () => {
  test("accesses due prompts", async () => {
    const testTaskID = "x" as PromptTaskID;
    await store.savePromptStateCaches([
      {
        ...testPromptStateCache,
        dueTimestampMillis: 1000,
        taskID: testTaskID,
      },
      {
        ...testPromptStateCache,
        dueTimestampMillis: 5000,
        taskID: "another" as PromptTaskID,
      },
    ]);

    expect(await store.getDuePromptStates(1000)).toMatchObject(
      new Map([[testTaskID, { ...testPromptState, dueTimestampMillis: 1000 }]]),
    );
  });

  test("indexed due times update when overwritten", async () => {
    const testTaskID = "x" as PromptTaskID;
    await store.savePromptStateCaches([
      {
        ...testPromptStateCache,
        dueTimestampMillis: 1000,
        taskID: testTaskID,
      } as PromptStateCache,
    ]);
    await store.savePromptStateCaches([
      {
        ...testPromptStateCache,
        dueTimestampMillis: 5000,
        taskID: testTaskID,
      } as PromptStateCache,
    ]);

    expect(await store.getDuePromptStates(1000)).toMatchObject(new Map());
    expect((await store.getDuePromptStates(5000)).size).toEqual(1);
  });
});
