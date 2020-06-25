import { AttachmentID, getAttachmentIDsInPrompt, Prompt } from "metabook-core";

export function getAttachmentIDsInPrompts(
  prompts: Iterable<Prompt>,
): Set<AttachmentID> {
  const output: Set<AttachmentID> = new Set();
  for (const maybeSpec of prompts) {
    for (const value of getAttachmentIDsInPrompt(maybeSpec)) {
      output.add(value);
    }
  }
  return output;
}
