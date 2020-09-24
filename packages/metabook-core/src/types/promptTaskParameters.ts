// Tasks speak to an individual thing a user has to do, like reviewing the second variant of an application prompt. Tasks are a function of a prompt's current state; e.g. to choose the variant of an application prompt to present, one must know not only the application prompt's data but also which variant was presented last.

export type QAPromptTaskParameters = null;

export type ApplicationPromptTaskParameters = {
  variantIndex: number;
};

export type ClozePromptTaskParameters = null;

export type PromptTaskParameters =
  | QAPromptTaskParameters
  | ApplicationPromptTaskParameters
  | ClozePromptTaskParameters;
