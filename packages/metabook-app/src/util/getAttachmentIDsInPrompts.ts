import { MetabookDataSnapshot } from "metabook-client";
import {
  AttachmentID,
  Prompt,
  PromptField,
  PromptID,
  QAPrompt,
} from "metabook-core";

function getAttachmentIDsInPrompt(spec: Prompt): Set<AttachmentID> {
  const output = new Set<AttachmentID>();

  function visitQAPrompt(qaPrompt: QAPrompt) {
    function visitPromptField(promptField: PromptField) {
      promptField.attachments.forEach((attachmentIDReference) =>
        output.add(attachmentIDReference.id),
      );
    }

    visitPromptField(qaPrompt.question);
    visitPromptField(qaPrompt.answer);
    if (qaPrompt.explanation) {
      visitPromptField(qaPrompt.explanation);
    }
  }

  switch (spec.promptType) {
    case "basic":
      visitQAPrompt(spec);
      break;
    case "applicationPrompt":
      spec.variants.forEach(visitQAPrompt);
      break;
    case "cloze":
      break;
  }
  return output;
}

export function getAttachmentIDsInPrompts(
  prompts: MetabookDataSnapshot<PromptID, Prompt>,
): Set<AttachmentID> {
  const output: Set<AttachmentID> = new Set();
  for (const maybeSpec of prompts.values()) {
    if (maybeSpec && !(maybeSpec instanceof Error)) {
      for (const value of getAttachmentIDsInPrompt(maybeSpec)) {
        output.add(value);
      }
    }
  }
  return output;
}
