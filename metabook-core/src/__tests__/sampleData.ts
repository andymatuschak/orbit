import {
  ApplicationPromptSpec,
  BasicPromptSpec,
  basicPromptSpecType,
  ClozePromptGroupSpec,
  QAPromptSpec,
} from "..";

// Unfortunately duplicates metabook-sample-data because there's a cyclical module dependency. I'd need to extract metabook-core's types to metabook-types to resolve it.
export const testQAPromptSpec: QAPromptSpec = {
  question: {
    contents: "Test question",
    attachments: [],
  },
  answer: {
    contents: "Test answer",
    attachments: [],
  },
  explanation: null,
};
export const testBasicPromptSpec: BasicPromptSpec = {
  ...testQAPromptSpec,
  promptSpecType: basicPromptSpecType,
};
export const testApplicationPromptSpec: ApplicationPromptSpec = {
  promptSpecType: "applicationPrompt",
  variants: [testQAPromptSpec, testQAPromptSpec],
};
export const testClozePromptGroupSpec: ClozePromptGroupSpec = {
  promptSpecType: "cloze",
  contents: "Test {cloze}",
};
