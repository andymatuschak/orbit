import {
  ApplicationPromptSpec,
  BasicPromptSpec,
  basicPromptSpecType,
  ClozePromptGroupSpec,
  QAPromptSpec,
} from "..";

export const testQAPromptSpec: QAPromptSpec = {
  question: "Test question",
  answer: "Test answer",
  explanation: null,
  attachments: [],
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
