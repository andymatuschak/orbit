import {
  AttachmentResolutionMap,
  getAttachmentIDsInPrompt,
  Prompt,
} from "metabook-core";

export default function getAttachmentURLsByIDInReviewItem(
  prompt: Prompt,
  attachmentResolutionMap: AttachmentResolutionMap | null,
): { [key: string]: string } {
  const attachmentIDs = getAttachmentIDsInPrompt(prompt);
  const output: { [key: string]: string } = {};
  for (const attachmentID of attachmentIDs) {
    const attachmentURLReference = attachmentResolutionMap?.get(attachmentID);
    if (!attachmentURLReference) {
      throw new Error(
        `Inconsistent attachment records: marked prompt containing attachment ${attachmentID} which is not in attachment URL table`,
      );
    }
    output[attachmentID] = attachmentURLReference.url;
  }
  return output;
}
