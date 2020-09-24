import { qaPromptType, Prompt } from "metabook-core";

// Our project-level fixture has multiple paragraphs, which isn't supported in this pipeline.
export const simpleOrbitPrompt: Prompt = {
  promptType: qaPromptType,
  question: {
    contents: "This is a test prompt.",
    attachments: [],
  },
  answer: {
    contents: "This is a test answer.",
    attachments: [],
  },
};
