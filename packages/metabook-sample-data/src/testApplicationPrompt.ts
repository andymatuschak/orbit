import { ApplicationPrompt } from "metabook-core";

const testApplicationPrompt: ApplicationPrompt = {
  promptType: "applicationPrompt",
  variants: [
    {
      question: {
        contents: "What is the derivative of e^3x?",
        attachments: [],
      },
      answer: {
        contents: "3e^3x.",
        attachments: [],
      },
      explanation: {
        contents: "The derivative of e^x is e^x.",
        attachments: [],
      },
    },
    {
      question: {
        contents: "Let f(x) = 2e^x. What is df/dx?",
        attachments: [],
      },
      answer: {
        contents: "2e^x",
        attachments: [],
      },
      explanation: null,
    },
  ],
};

export default testApplicationPrompt;
