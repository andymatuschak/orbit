import {
  ClozeTaskContent,
  MemoryTaskSpec,
  TaskContentType,
  TaskSpecType,
} from "@withorbit/core";

export const testClozeSpec: MemoryTaskSpec<ClozeTaskContent> = {
  type: TaskSpecType.Memory,
  content: {
    type: TaskContentType.Cloze,
    body: {
      text: "This is a test cloze prompt.",
      attachments: [],
    },
    components: {
      a: {
        order: 0,
        ranges: [
          {
            startIndex: 5,
            length: 5,
            hint: null,
          },
        ],
      },
      b: {
        order: 1,
        ranges: [
          {
            startIndex: 2,
            length: 2,
            hint: null,
          },
        ],
      },
    },
  },
};
