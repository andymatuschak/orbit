// Prompt states describe a user's state relative to a given *prompt task* (not a prompt).

import { ActionLogID } from "../actionLogID";
import {
  PromptTask,
  PromptTaskMetadata,
  PromptTaskParametersOf,
} from "../types/promptTask";

export interface PromptState<PT extends PromptTask = PromptTask> {
  headActionLogIDs: ActionLogID[];
  taskMetadata: PromptTaskMetadata;

  lastReviewTimestampMillis: number;
  lastReviewTaskParameters: PromptTaskParametersOf<PT> | null;
  dueTimestampMillis: number;
  needsRetry: boolean;

  intervalMillis: number;
  bestIntervalMillis: number | null;
}
