import { ApplicationPromptSpec } from "metabook-core";

const testApplicationPromptSpec: ApplicationPromptSpec = {
  promptSpecType: "applicationPrompt",
  variants: [
    {
      question: "What is the derivative of e^3x?",
      answer: "3e^3x.",
      explanation: "The derivative of e^x is e^x.",
      attachments: [],
    },
    {
      question: "Let f(x) = 2e^x. What is df/dx?",
      answer: "2e^x",
      explanation: null,
      attachments: [],
    },
  ],
};

export default testApplicationPromptSpec;
