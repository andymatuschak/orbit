import shimFirebasePersistence from "firebase-node-persistence-shim";
import {
  ActionLog,
  IngestActionLog,
  ingestActionLogType,
  PromptRepetitionOutcome,
  RepetitionActionLog,
  repetitionActionLogType,
} from "metabook-core";
import ActionLogStore from "./actionLogStore";

beforeAll(() => {
  shimFirebasePersistence();
});

let actionLogStore: ActionLogStore;
beforeEach(() => {
  actionLogStore = new ActionLogStore();
});
afterEach(async () => {
  await actionLogStore.clear();
  await actionLogStore.close();
});

const testIngestLog: IngestActionLog = {
  timestampMillis: 500,
  taskID: "x",
  actionLogType: ingestActionLogType,
  metadata: null,
};
const testRepetitionLog: RepetitionActionLog = {
  timestampMillis: 700,
  taskID: "x",
  actionLogType: repetitionActionLogType,
  taskParameters: null,
  parentActionLogIDs: [],
  context: null,
  outcome: PromptRepetitionOutcome.Remembered,
};

describe("server timestamps", () => {
  beforeEach(async () => {
    await actionLogStore.saveActionLogs([
      { log: testIngestLog, serverTimestamp: { seconds: 10, nanoseconds: 0 } },
    ]);
  });

  test("updates last server timestamp when newer", async () => {
    expect(
      (await actionLogStore.saveActionLogs([
        {
          log: testIngestLog,
          serverTimestamp: { seconds: 20, nanoseconds: 0 },
        },
      ]))!.seconds,
    ).toEqual(20);
  });

  test("doesn't update last server timestamp when not newer", async () => {
    expect(
      (await actionLogStore.saveActionLogs([
        {
          log: testIngestLog,
          serverTimestamp: { seconds: 6, nanoseconds: 0 },
        },
      ]))!.seconds,
    ).toEqual(10);
  });
});

describe("taskID index", () => {
  test("returns logs by task ID", async () => {
    const testLogs = [
      {
        log: testIngestLog,
        serverTimestamp: null,
      },
      {
        log: testRepetitionLog,
        serverTimestamp: null,
      },
    ];
    await actionLogStore.saveActionLogs(testLogs);
    expect(await actionLogStore.getActionLogsByTaskID("x")).toMatchObject([
      testLogs[0].log,
      testLogs[1].log,
    ]);
  });

  test("doesn't return non-matching logs by taskID", async () => {
    const testLogs = [
      {
        log: { ...testIngestLog, taskID: "y" },
        serverTimestamp: null,
      },
    ];
    await actionLogStore.saveActionLogs(testLogs);
    expect(await actionLogStore.getActionLogsByTaskID("x")).toHaveLength(0);
  });

  test("iterates all logs by task ID", async () => {
    const testLogs = [
      {
        log: testIngestLog,
        serverTimestamp: null,
      },
      {
        log: testRepetitionLog,
        serverTimestamp: null,
      },
      {
        log: { ...testIngestLog, taskID: "y" },
        serverTimestamp: null,
      },
    ];
    await actionLogStore.saveActionLogs(testLogs);

    const iteratedValues: { taskID: string; logs: ActionLog[] }[] = [];
    await actionLogStore.iterateAllActionLogsByTaskID(async (taskID, logs) =>
      iteratedValues.push({ taskID, logs }),
    );
    expect(iteratedValues).toHaveLength(2);
    expect(iteratedValues[0].taskID).toEqual("x");
    expect(iteratedValues[0].logs).toHaveLength(2);
    expect(iteratedValues[1].taskID).toEqual("y");
    expect(iteratedValues[1].logs).toHaveLength(1);
  });
});
