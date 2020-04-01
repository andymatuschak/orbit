// Tasks speak to an individual thing a user has to do, like reviewing the second variant of an application prompt. Tasks are a function of a prompt's current state; e.g. to choose the variant of an application prompt to present, one must know not only the application prompt's data but also which variant was presented last.

import { ApplicationPrompt, BasicPrompt, ClozePrompt, Prompt } from "./prompt";

interface BasePromptTask<
  PromptType extends Prompt,
  TaskParametersType extends PromptTaskParameters
> {
  prompt: PromptType;
  parameters: TaskParametersType;
}

export type BasicPromptTask = BasePromptTask<
  BasicPrompt,
  BasicPromptTaskParameters
>;
export type ApplicationPromptTask = BasePromptTask<
  ApplicationPrompt,
  ApplicationPromptTaskParameters
>;
export type ClozePromptTask = BasePromptTask<
  ClozePrompt,
  ClozePromptTaskParameters
>;

export type PromptTask =
  | BasicPromptTask
  | ClozePromptTask
  | ApplicationPromptTask;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type BasicPromptTaskParameters = null;

export interface ApplicationPromptTaskParameters {
  variantIndex: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type ClozePromptTaskParameters = null;

export type PromptTaskParameters =
  | BasicPromptTaskParameters
  | ApplicationPromptTaskParameters
  | ClozePromptTaskParameters;
