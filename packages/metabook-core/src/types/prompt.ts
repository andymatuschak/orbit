// A *prompt* describes the data for one or more related prompt tasks. A cloze prompt, for example, generates many tasks (one for each deletion).

import { AttachmentIDReference } from "./attachmentIDReference";

export interface PromptField {
  contents: string;
  attachments: AttachmentIDReference[];
}

export interface QAPrompt {
  question: PromptField;
  answer: PromptField;
  explanation?: PromptField;
}

export const basicPromptType = "basic";
export interface BasicPrompt extends QAPrompt {
  promptType: typeof basicPromptType;
}

export const applicationPromptType = "applicationPrompt";
export interface ApplicationPrompt {
  promptType: typeof applicationPromptType;
  variants: QAPrompt[];
}

export const clozePromptType = "cloze";
export interface ClozePrompt {
  promptType: typeof clozePromptType;
  body: PromptField;
}

export type Prompt = BasicPrompt | ApplicationPrompt | ClozePrompt;
export type PromptType = Prompt["promptType"];
