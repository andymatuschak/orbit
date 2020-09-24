// A *prompt* describes the data for one or more related prompt tasks. A cloze prompt, for example, generates many tasks (one for each deletion).

import { AttachmentIDReference } from "./attachmentIDReference";

export interface PromptField {
  contents: string;
  attachments: AttachmentIDReference[];
}

export interface QAPromptContents {
  question: PromptField;
  answer: PromptField;
  explanation?: PromptField;
}

export const qaPromptType = "qaPrompt";
export interface QAPrompt extends QAPromptContents {
  promptType: typeof qaPromptType;
}

export const applicationPromptType = "applicationPrompt";
export interface ApplicationPrompt {
  promptType: typeof applicationPromptType;
  variants: QAPromptContents[];
}

export const clozePromptType = "clozePrompt";
export interface ClozePrompt {
  promptType: typeof clozePromptType;
  body: PromptField;
}

export type Prompt = QAPrompt | ApplicationPrompt | ClozePrompt;
export type PromptType = Prompt["promptType"];
