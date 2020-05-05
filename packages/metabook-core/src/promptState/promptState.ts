// Prompt states describe a user's state relative to a given *prompt* (not a prompt spec, not a task).

import { PromptProvenance } from "..";
import { ActionLogID } from "../actionLogID";
import { PromptTaskParameters } from "../types/promptTaskParameters";

export interface PromptState {
  headActionLogIDs: ActionLogID[];

  lastReviewTimestampMillis: number;
  lastReviewTaskParameters: PromptTaskParameters | null;
  dueTimestampMillis: number;
  needsRetry: boolean;

  intervalMillis: number;
  bestIntervalMillis: number | null;
  provenance: PromptProvenance | null;
}
