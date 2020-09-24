import { EmbeddedItem } from "metabook-app/src/embedded/embeddedItem";
import { qaPromptType } from "metabook-core";
import { OrbitPromptElement } from "./OrbitPromptElement";

export function extractItems(parentElement: HTMLElement): EmbeddedItem[] {
  const items: EmbeddedItem[] = [];
  parentElement
    .querySelectorAll<OrbitPromptElement>(":scope > orbit-prompt")
    .forEach((element) => {
      const question = element.getAttribute("question");
      if (!question) {
        console.error("Prompt is missing question", element);
        return;
      }

      const answer = element.getAttribute("answer");
      if (!answer) {
        console.error("Prompt is missing answer", element);
        return;
      }

      const questionAttachments = element.getAttribute("question-attachments");
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
    });
  return items;
}
