import { PromptRepetitionOutcome } from "../spacedRepetition";
import { ingestActionLogType, repetitionActionLogType } from "./actionLog";
import {
  getActionLogFromPromptActionLog,
  getPromptActionLogFromActionLog,
  PromptIngestActionLog,
  PromptRepetitionActionLog,
} from "./promptActionLog";
import { PromptProvenanceType } from "./promptProvenance";
import { PromptTaskID } from "./promptTask";
import { ApplicationPromptTaskParameters } from "./promptTaskParameters";

describe("ingest", () => {
  const promptActionLog: PromptIngestActionLog = {
    provenance: {
      provenanceType: PromptProvenanceType.Anki,
      title: null,
      url: null,
      externalID: "10",
      modificationTimestampMillis: 1000,
    },
    timestampMillis: 1000,
    taskID: "3" as PromptTaskID,
    actionLogType: ingestActionLogType,
  };

  const actionLog = getActionLogFromPromptActionLog(promptActionLog);
  test("round trip", () => {
    expect(getPromptActionLogFromActionLog(actionLog)).toEqual(promptActionLog);
  });
});

describe("repetition", () => {
  const promptActionLog: PromptRepetitionActionLog<ApplicationPromptTaskParameters> = {
    timestampMillis: 1000,
    actionLogType: repetitionActionLogType,
    taskParameters: { variantIndex: 1 },
    parentActionLogIDs: [],
    outcome: PromptRepetitionOutcome.Remembered,
    taskID: "3" as PromptTaskID,
    context: null,
  };

  const actionLog = getActionLogFromPromptActionLog(promptActionLog);
  test("round trip", () => {
    expect(getPromptActionLogFromActionLog(actionLog)).toEqual(promptActionLog);
  });
});
