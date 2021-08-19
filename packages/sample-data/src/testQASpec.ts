import {
  MemoryTaskSpec,
  QATaskContent,
  TaskContentType,
  TaskSpecType,
} from "@withorbit/core";

export const testQASpec: MemoryTaskSpec<QATaskContent> = {
  type: TaskSpecType.Memory,
  content: {
    type: TaskContentType.QA,
    body: {
      text: "Is it possible to use _quantum teleportation_ to transmit information faster than light?\n\nThis is a **second paragraph** with _**bold italic**_.",
      attachments: [],
    },
    answer: {
      text: "No.",
      attachments: [],
    },
  },
};
