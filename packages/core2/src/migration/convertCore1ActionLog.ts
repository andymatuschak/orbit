import {
  ActionLogID,
  getPromptTaskForID,
  ingestActionLogType,
  Prompt,
  PromptActionLog,
  PromptProvenance,
  PromptProvenanceType,
  PromptRepetitionOutcome,
  repetitionActionLogType,
  rescheduleActionLogType,
  updateMetadataActionLogType,
} from "@withorbit/core";
import { mainTaskComponentID, TaskID, TaskProvenance } from "../entities/task";
import { Event, EventID, EventType, TaskRepetitionOutcome } from "../event";
import { convertCore1ID } from "./convertCore1ID";
import { convertCore1Prompt } from "./convertCore1Prompt";

// n.b. does *not* emit core2 attachment ingest events; clients must do this separately for migrated attachments
export function convertCore1ActionLog(
  promptActionLog: PromptActionLog,
  actionLogID: ActionLogID,
  prompt: Prompt,
): Event[] {
  const promptTask = getPromptTaskForID(promptActionLog.taskID);
  if (promptTask instanceof Error) {
    throw promptTask;
  }

  const base = {
    id: convertCore1ID<EventID>(actionLogID),
    entityID: convertCore1ID<TaskID>(promptTask.promptID),
    timestampMillis: promptActionLog.timestampMillis,
  };
  const componentID =
    promptTask.promptParameters?.clozeIndex?.toString() ?? mainTaskComponentID;

  switch (promptActionLog.actionLogType) {
    case ingestActionLogType:
      return [
        {
          ...base,
          type: EventType.TaskIngest,
          provenance: promptActionLog.provenance
            ? convertCore1Provenance(promptActionLog.provenance)
            : null,
          spec: convertCore1Prompt(prompt),
        },
      ];
    case repetitionActionLogType:
      return [
        {
          ...base,
          type: EventType.TaskRepetition,
          componentID,
          reviewSessionID: promptActionLog.context ?? "",
          outcome: convertCore1Outcome(promptActionLog.outcome),
        },
      ];
    case rescheduleActionLogType:
      return [
        {
          ...base,
          type: EventType.TaskReschedule,
          componentID,
          newDueTimestampMillis: promptActionLog.newTimestampMillis,
        },
      ];
    case updateMetadataActionLogType:
      const entries = Object.entries(promptActionLog.updates);
      return entries.map(([key, newValue]) => {
        if (key === "isDeleted") {
          if (typeof newValue !== "boolean") {
            throw new Error(
              `Unexpected isDeleted value ${newValue}; should be boolean`,
            );
          }
          return {
            ...base,
            type: EventType.TaskUpdateDeleted,
            isDeleted: newValue,
          };
        } else if (key === "provenance") {
          if (newValue === null) {
            return {
              ...base,
              type: EventType.TaskUpdateProvenanceEvent,
              provenance: null,
            };
          } else if (typeof newValue === "object") {
            return {
              ...base,
              type: EventType.TaskUpdateProvenanceEvent,
              provenance: convertCore1Provenance(newValue),
            };
          } else {
            throw new Error(`Unexpected promptProvenance value ${newValue}`);
          }
        } else {
          // TODO: implement log type and migration for changes to provenance (or just hack around it--I'm the only user with such logs)
          throw new Error(
            `Unsupported migration for metadata update key ${key}`,
          );
        }
      });
  }
}

function convertCore1Outcome(
  outcome: PromptRepetitionOutcome,
): TaskRepetitionOutcome {
  switch (outcome) {
    case PromptRepetitionOutcome.Remembered:
      return TaskRepetitionOutcome.Remembered;
    case PromptRepetitionOutcome.Forgotten:
      return TaskRepetitionOutcome.Forgotten;
  }
}

function convertCore1Provenance(provenance: PromptProvenance): TaskProvenance {
  const colorPaletteName =
    (provenance.provenanceType === PromptProvenanceType.Web &&
      provenance.colorPaletteName) ||
    null;
  const containerTitle =
    (provenance.provenanceType === PromptProvenanceType.Web &&
      provenance.siteName) ||
    null;
  return {
    identifier: provenance.externalID,
    title: provenance.title ?? undefined,
    url: provenance.url ?? undefined,
    ...(colorPaletteName !== null && { colorPaletteName }),
    ...(containerTitle !== null && { containerTitle }),
  };
}
