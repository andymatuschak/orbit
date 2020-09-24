import {
  ApplicationPrompt,
  QAPrompt,
  qaPromptType,
  ClozePrompt,
  QAPromptContents,
} from "..";

// Unfortunately duplicates metabook-sample-data because there's a cyclical module dependency. I'd need to extract metabook-core's types to metabook-types to resolve it.
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
  promptType: "applicationPrompt",
  variants: [testQAPrompt, testQAPrompt],
};
export const testClozePrompt: ClozePrompt = {
  promptType: "cloze",
  body: {
    contents: "Test {cloze}",
    attachments: [],
  },
};
