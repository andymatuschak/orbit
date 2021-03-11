import { clozePromptType, qaPromptType } from "@withorbit/core";
import { EmbeddedItem } from "@withorbit/embedded-support";
import { OrbitPromptElement } from "./OrbitPromptElement";

export function extractItems(parentElement: HTMLElement): EmbeddedItem[] {
  const items: EmbeddedItem[] = [];
  parentElement
    .querySelectorAll<OrbitPromptElement>(":scope > orbit-prompt")
    .forEach((element) => {
      const cloze = element.getAttribute("cloze");
      if (cloze) {
        items.push({
          type: clozePromptType,
          body: {
            contents: cloze,
            // TODO: attachments
          },
        });
      } else {
        const question = element.getAttribute("question");
        if (question === null) {
          console.error("Prompt is missing question", element);
          return;
        }

        const answer = element.getAttribute("answer");
        if (answer === null) {
          console.error("Prompt is missing answer", element);
          return;
        }

        const questionAttachments = element.getAttribute(
          "question-attachments",
        );
        const answerAttachments = element.getAttribute("answer-attachments");

        items.push({
          type: qaPromptType,
          question: {
            contents: question,
            ...(questionAttachments && {
              attachmentURLs: questionAttachments.split(";"),
            }),
          },
          answer: {
            contents: answer,
            ...(answerAttachments && {
              attachmentURLs: answerAttachments.split(";"),
            }),
          },
        });
      }
    });
  return items;
}
