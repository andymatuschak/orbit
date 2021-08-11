import {
  applicationPromptType,
  clozePromptType,
  Prompt,
  PromptField,
  qaPromptType,
} from "@withorbit/core";
import {
  TaskContentField,
  TaskContentType,
  TaskSpec,
  TaskSpecType,
} from "../entities/task";
import { parseSingleCurlyBraceClozePromptMarkup } from "../entities/util/parseClozeMarkup";

export function convertCore1Prompt(prompt: Prompt): TaskSpec {
  switch (prompt.promptType) {
    case qaPromptType:
      return {
        type: TaskSpecType.Memory,
        content: {
          type: TaskContentType.QA,
          body: convertPromptField(prompt.question),
          answer: convertPromptField(prompt.answer),
        },
      };

    case clozePromptType:
      const { markupWithoutBraces, clozeComponents } =
        parseSingleCurlyBraceClozePromptMarkup(prompt.body.contents);

      return {
        type: TaskSpecType.Memory,
        content: {
          type: TaskContentType.Cloze,
          body: {
            text: markupWithoutBraces,
            attachments: prompt.body.attachments.map(({ id }) => id),
          },
          components: clozeComponents,
        },
      };

    case applicationPromptType:
      throw new Error("Unimplemented");
  }
}

function convertPromptField(promptField: PromptField): TaskContentField {
  return {
    text: promptField.contents,
    attachments: promptField.attachments.map(({ id }) => id),
  };
}
