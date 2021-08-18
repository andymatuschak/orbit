import {
  parseSingleCurlyBraceClozePromptMarkup,
  TaskContentType,
  TaskSpec,
  TaskSpecType,
} from "@withorbit/core2";

export const simpleOrbitQATaskSpec: TaskSpec = {
  type: TaskSpecType.Memory,
  content: {
    type: TaskContentType.QA,
    body: {
      text: "This is a test prompt.",
      attachments: [],
    },
    answer: {
      text: "1936\\.",
      attachments: [],
    },
  },
};

const { markupWithoutBraces, clozeComponents } =
  parseSingleCurlyBraceClozePromptMarkup("This {is} a {test cloze}.");
export const simpleOrbitClozeTaskSpec: TaskSpec = {
  type: TaskSpecType.Memory,
  content: {
    type: TaskContentType.Cloze,
    body: {
      text: markupWithoutBraces,
      attachments: [],
    },
    components: clozeComponents,
  },
};
