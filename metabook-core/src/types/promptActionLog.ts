import { MetabookActionOutcome } from "../spacedRepetition";
import { IngestActionLog } from "./actionLog";
import { PromptTaskID } from "./promptTask";
import { PromptTaskParameters } from "./promptTaskParameters";

// Prompt-specific definitions of ActionLog which include domain-specific narrowings of relevant fields.

export interface PromptIngestActionLog extends IngestActionLog {
  taskID: PromptTaskID;
}

export interface PromptRepetitionActionLog extends IngestActionLog {
  taskID: PromptTaskID;
  taskParameters: PromptTaskParameters;

  outcome: MetabookActionOutcome;
}

export type PromptActionLog = PromptIngestActionLog | PromptRepetitionActionLog;
