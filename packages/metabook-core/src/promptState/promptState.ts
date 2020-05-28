// Prompt states describe a user's state relative to a given *prompt* (not a prompt spec, not a task).

import { PromptProvenance } from "..";
import { ActionLogID } from "../actionLogID";
import { PromptTaskMetadata } from "../types/promptTask";
import { PromptTaskParameters } from "../types/promptTaskParameters";
import { TaskMetadata } from "../types/taskMetadata";

export interface PromptState {
  headActionLogIDs: ActionLogID[];
  taskMetadata: PromptTaskMetadata;

  lastReviewTimestampMillis: number;
  lastReviewTaskParameters: PromptTaskParameters | null;
  dueTimestampMillis: number;
  needsRetry: boolean;

  intervalMillis: number;
  bestIntervalMillis: number | null;
}
