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
      cardID: 10,
      cardModificationTimestampMillis: 1000,
      provenanceType: PromptProvenanceType.Anki,
    },
    timestampMillis: 1000,
    taskID: "3" as PromptTaskID,
    actionLogType: ingestActionLogType,
  };

  const actionLog = getActionLogFromPromptActionLog(promptActionLog);

  test("encodes provenance as metadata", () => {
    expect((actionLog as any).metadata).toEqual(promptActionLog.provenance);
  });

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
