// Prompt states describe a user's state relative to a given *prompt* (not a prompt spec, not a task).

import {
  ApplicationPromptTaskParameters,
  BasicPromptTaskParameters,
  ClozePromptTaskParameters,
  PromptTaskParameters,
} from "./promptTask";

interface BasePromptState<TaskParametersType extends PromptTaskParameters> {
  dueTimestampMillis: number;
  interval: number;
  bestInterval: number | null;
  needsRetry: boolean;
  taskParameters: TaskParametersType;
}

export type BasicPromptState = BasePromptState<BasicPromptTaskParameters>;
export type ApplicationPromptState = BasePromptState<
  ApplicationPromptTaskParameters
>;
export type ClozePromptState = BasePromptState<ClozePromptTaskParameters>;
export type PromptState =
  | BasicPromptState
  | ApplicationPromptState
  | ClozePromptState;
