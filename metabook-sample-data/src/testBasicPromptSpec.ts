import { BasicPromptSpec } from "metabook-core";

const testBasicPromptSpec: BasicPromptSpec = {
  promptSpecType: "basic",
  question: {
    contents:
      "Is it possible to use _quantum teleportation_ to transmit information faster than light?\n\nThis is a **second paragraph**.",
    attachments: [],
  },
  answer: {
    contents: "No.",
    attachments: [],
  },
  explanation: null,
};

export default testBasicPromptSpec;
