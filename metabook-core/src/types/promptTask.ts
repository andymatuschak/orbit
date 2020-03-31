// Tasks speak to an individual thing a user has to do, like reviewing the second variant of an application prompt. Tasks are a function of a prompt's current state; e.g. to choose the variant of an application prompt to present, one must know not only the application prompt's data but also which variant was presented last.

import {
  ApplicationPromptSpec,
  BasicPromptSpec,
  ClozePromptGroupSpec,
} from "./promptSpec";

export type BasicPromptTask = {
  spec: BasicPromptSpec;
};

export type ClozePromptTask = {
  spec: ClozePromptGroupSpec;
  clozeIndex: number;
};

export type ApplicationPromptTask = {
  spec: ApplicationPromptSpec;
  variantIndex: number;
};

export type PromptTask =
  | BasicPromptTask
  | ClozePromptTask
  | ApplicationPromptTask;
