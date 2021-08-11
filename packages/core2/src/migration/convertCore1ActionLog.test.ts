import {
  ActionLogID,
  clozePromptType,
  getIDForPromptTask,
  ingestActionLogType,
  PromptID,
  PromptIngestActionLog,
  PromptProvenanceType,
  PromptRepetitionActionLog,
  PromptRepetitionOutcome,
  PromptRescheduleActionLog,
  PromptTask,
  PromptUpdateMetadataActionLog,
  repetitionActionLogType,
  rescheduleActionLogType,
  updateMetadataActionLogType,
} from "@withorbit/core";
import {
  EventType,
  TaskIngestEvent,
  TaskRepetitionEvent,
  TaskRepetitionOutcome,
} from "../event";
import { convertCore1ActionLog } from "./convertCore1ActionLog";
import { convertCore1ID } from "./convertCore1ID";
import { convertCore1Prompt } from "./convertCore1Prompt";
import { testClozePrompt } from "./convertCore1Prompt.test";

const testPromptTaskID = getIDForPromptTask({
  promptType: clozePromptType,
  promptID: "testPromptID" as PromptID,
  promptParameters: { clozeIndex: 1 },
});
test("convert ingest log", () => {
  const log: PromptIngestActionLog = {
    actionLogType: ingestActionLogType,
    provenance: {
      provenanceType: PromptProvenanceType.Web,
      siteName: "Site name",
      url: "https://google.com",
      colorPaletteName: "red",
      externalID: "https://google.com/foo/bar",
      title: "Test Title",
      modificationTimestampMillis: null,
    },
    taskID: testPromptTaskID,
    timestampMillis: 500,
  };

  const outputLogs = convertCore1ActionLog(
    log,
    "logID" as ActionLogID,
    testClozePrompt,
  );
  expect(outputLogs.length).toEqual(1);
  const outputLog = outputLogs[0] as TaskIngestEvent;
  expect(outputLog.entityID).toEqual(convertCore1ID("testPromptID"));
  expect(outputLog.id).toEqual(convertCore1ID("logID"));
  expect(outputLog.type).toEqual(EventType.TaskIngest);
  expect(outputLog.provenance).toMatchInlineSnapshot(`
Object {
  "colorPaletteName": "red",
  "containerTitle": "Site name",
  "identifier": "https://google.com/foo/bar",
  "title": "Test Title",
  "url": "https://google.com",
}
`);
  expect(outputLog.spec).toMatchObject(convertCore1Prompt(testClozePrompt));
});

test("convert repetition log", () => {
  const log: PromptRepetitionActionLog<PromptTask> = {
    actionLogType: repetitionActionLogType,
    timestampMillis: 500,
    taskID: testPromptTaskID,
    context: "testContext",
    outcome: PromptRepetitionOutcome.Remembered,
    parentActionLogIDs: [],
    taskParameters: null,
  };

  const outputLogs = convertCore1ActionLog(
    log,
    "logID" as ActionLogID,
    testClozePrompt,
  );
  expect(outputLogs.length).toEqual(1);
  const outputLog = outputLogs[0] as TaskRepetitionEvent;
  expect(outputLog.type).toEqual(EventType.TaskRepetition);
  expect(outputLog.outcome).toEqual(TaskRepetitionOutcome.Remembered);
  expect(outputLog.reviewSessionID).toEqual(log.context);
  expect(outputLog.componentID).toEqual("1");
});

test("convert reschedule log", () => {
  const log: PromptRescheduleActionLog = {
    actionLogType: rescheduleActionLogType,
    timestampMillis: 500,
    taskID: testPromptTaskID,
    parentActionLogIDs: [],
    newTimestampMillis: 1000,
  };

  const outputLogs = convertCore1ActionLog(
    log,
    "logID" as ActionLogID,
    testClozePrompt,
  );
  expect(outputLogs.length).toEqual(1);
  expect(outputLogs[0]).toMatchObject({
    type: EventType.TaskReschedule,
    newDueTimestampMillis: log.newTimestampMillis,
  });
});

test("convert delete log", () => {
  const log: PromptUpdateMetadataActionLog = {
    actionLogType: updateMetadataActionLogType,
    timestampMillis: 500,
    taskID: testPromptTaskID,
    parentActionLogIDs: [],
    updates: {
      isDeleted: true,
    },
  };
  const outputLogs = convertCore1ActionLog(
    log,
    "logID" as ActionLogID,
    testClozePrompt,
  );
  expect(outputLogs.length).toEqual(1);
  expect(outputLogs[0]).toMatchObject({
    type: EventType.TaskUpdateDeleted,
    isDeleted: true,
  });
});

test("convert provenance update log", () => {
  const log: PromptUpdateMetadataActionLog = {
    actionLogType: updateMetadataActionLogType,
    timestampMillis: 500,
    taskID: testPromptTaskID,
    parentActionLogIDs: [],
    updates: {
      provenance: {
        provenanceType: PromptProvenanceType.Web,
        siteName: "site name",
        url: "https://test.com",
        colorPaletteName: "yellow",
        externalID: "test id",
        modificationTimestampMillis: null,
        title: "test title",
      },
    },
  };
  const outputLogs = convertCore1ActionLog(
    log,
    "logID" as ActionLogID,
    testClozePrompt,
  );
  expect(outputLogs.length).toEqual(1);
  expect(outputLogs[0]).toMatchObject({
    type: EventType.TaskUpdateProvenanceEvent,
    provenance: {
      title: "test title",
      identifier: "test id",
    },
  });
});
