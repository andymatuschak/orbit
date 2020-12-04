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
// This is poor API design. Once I understand better what parsing is required, I'd like to design a better interface for this.
export function createClozeMarkupRegexp() {
  return new RegExp(/{([^{}]+?)}/g);
}

export function getClozeDeletionCount(prompt: ClozePrompt) {
  let count = 0;
  const regexp = createClozeMarkupRegexp();
  while (regexp.exec(prompt.body.contents) !== null) {
    count++;
  }
  return count;
}

export type Prompt = QAPrompt | ApplicationPrompt | ClozePrompt;
export type PromptType = Prompt["promptType"];
