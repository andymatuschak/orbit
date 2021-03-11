import { QAPrompt, qaPromptType } from "@withorbit/core";

const testQAPrompt: QAPrompt = {
  promptType: qaPromptType,
  question: {
    contents:
      "Is it possible to use _quantum teleportation_ to transmit information faster than light?\n\nThis is a **second paragraph** with _**bold italic**_.",
    attachments: [],
  },
  answer: {
    contents: "No.",
    attachments: [],
  },
};

export default testQAPrompt;
