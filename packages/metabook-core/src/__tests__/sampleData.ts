import {
  ApplicationPrompt,
  applicationPromptType,
  ClozePrompt,
  clozePromptType,
  QAPrompt,
  QAPromptContents,
  qaPromptType,
} from "..";

// Unfortunately duplicates @withorbit/sample-data because there's a cyclical module dependency. I'd need to extract metabook-core's types to metabook-types to resolve it.
export const testQAPromptContents: QAPromptContents = {
  question: {
    contents: "Test question",
    attachments: [],
  },
  answer: {
    contents: "Test answer",
    attachments: [],
  },
};
export const testQAPrompt: QAPrompt = {
  ...testQAPromptContents,
  promptType: qaPromptType,
};
export const testApplicationPrompt: ApplicationPrompt = {
  promptType: applicationPromptType,
  variants: [testQAPrompt, testQAPrompt],
};
export const testClozePrompt: ClozePrompt = {
  promptType: clozePromptType,
  body: {
    contents: "Test {cloze} deletion {type prompt}.",
    attachments: [],
  },
};
