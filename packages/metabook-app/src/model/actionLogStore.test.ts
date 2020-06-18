import shimFirebasePersistence from "firebase-node-persistence-shim";
import {
  ActionLog,
  getIDForActionLog,
  IngestActionLog,
  ingestActionLogType,
  PromptRepetitionOutcome,
  PromptTaskID,
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
  provenance: null,
};
const testIngestLogID = getIDForActionLog(testIngestLog);
const testRepetitionLog: RepetitionActionLog = {
  timestampMillis: 700,
  taskID: "x",
  actionLogType: repetitionActionLogType,
  taskParameters: null,
  parentActionLogIDs: [],
  context: null,
  outcome: PromptRepetitionOutcome.Remembered,
};
const testRepetitionLogID = getIDForActionLog(testRepetitionLog);

describe("server timestamps", () => {
  beforeEach(async () => {
    await actionLogStore.saveActionLogs([
      {
        log: testIngestLog,
        id: testIngestLogID,
        serverTimestamp: { seconds: 10, nanoseconds: 0 },
      },
    ]);
  });

  test("updates last server timestamp when newer", async () => {
    expect(
      (await actionLogStore.saveActionLogs([
        {
          log: testIngestLog,
          id: testIngestLogID,
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
          id: testIngestLogID,
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
        id: testIngestLogID,
        serverTimestamp: null,
      },
      {
        log: testRepetitionLog,
        id: testRepetitionLogID,
        serverTimestamp: null,
      },
    ];
    await actionLogStore.saveActionLogs(testLogs);
    expect(await actionLogStore.getActionLogsByTaskID("x")).toMatchObject([
      { id: testIngestLogID, log: testLogs[0].log },
      { id: testRepetitionLogID, log: testLogs[1].log },
    ]);
  });

  test("doesn't return non-matching logs by taskID", async () => {
    const variantLog = { ...testIngestLog, taskID: "y" };
    const testLogs = [
      {
        log: variantLog,
        id: getIDForActionLog(variantLog),
        serverTimestamp: null,
      },
    ];
    await actionLogStore.saveActionLogs(testLogs);
    expect(await actionLogStore.getActionLogsByTaskID("x")).toHaveLength(0);
  });

  test("iterates all logs by task ID", async () => {
    const ingestLogVariant = { ...testIngestLog, taskID: "y" };
    const testLogs = [
      {
        log: testIngestLog,
        id: testIngestLogID,
        serverTimestamp: null,
      },
      {
        log: testRepetitionLog,
        id: testRepetitionLogID,
        serverTimestamp: null,
      },
      {
        log: ingestLogVariant,
        id: getIDForActionLog(ingestLogVariant),
        serverTimestamp: null,
      },
    ];
    await actionLogStore.saveActionLogs(testLogs);

    const iteratedValues: { taskID: string; logs: ActionLog[] }[] = [];
    await actionLogStore.iterateAllActionLogsByTaskID(
      async (taskID, logEntries) =>
        iteratedValues.push({ taskID, logs: logEntries.map((e) => e.log) }),
    );
    expect(iteratedValues).toHaveLength(2);
    expect(iteratedValues[0].taskID).toEqual("x");
    expect(iteratedValues[0].logs).toHaveLength(2);
    expect(iteratedValues[1].taskID).toEqual("y");
    expect(iteratedValues[1].logs).toHaveLength(1);
  });
});

describe("dangling task IDs", () => {
  test("round trips", async () => {
    await actionLogStore.markDanglingTaskIDs(["x" as PromptTaskID]);
    expect(await actionLogStore.getDanglingTaskIDs()).toEqual([
      "x" as PromptTaskID,
    ]);
  });

  test("clears", async () => {
    await actionLogStore.markDanglingTaskIDs(["x" as PromptTaskID]);
    await actionLogStore.clearDanglingTaskIDs(["x" as PromptTaskID]);
    expect(await actionLogStore.getDanglingTaskIDs()).toEqual([]);
  });
});
