import {
  AttachmentIDReference,
  BasicPrompt,
  basicPromptType,
  PromptField,
} from "metabook-core";
import {
  AttachmentResolutionMap,
  promptReviewItemType,
  ReviewItem,
  styles,
} from "metabook-ui";

export interface EmbeddedPromptField {
  contents: string;
  attachmentURLs?: string[];
}

export interface EmbeddedBasicPrompt {
  type: typeof basicPromptType;
  question: EmbeddedPromptField;
  answer: EmbeddedPromptField;
}

export type EmbeddedItem = EmbeddedBasicPrompt;

function getPromptFieldFromEmbeddedPromptField(
  embeddedPromptField: EmbeddedPromptField,
  attachmentURLsToIDReferences: Map<string, AttachmentIDReference>,
): PromptField | Error {
  try {
    return {
      contents: embeddedPromptField.contents,
      attachments:
        embeddedPromptField.attachmentURLs?.map((attachmentURL) => {
          const attachmentIDReference = attachmentURLsToIDReferences.get(
            attachmentURL,
          );
          if (attachmentIDReference) {
            return attachmentIDReference;
          } else {
            throw new Error(
              `Attachment map contains no data for URL: ${attachmentURL}`,
            );
          }
        }) ?? [],
    };
  } catch (error) {
    return error;
  }
}

function getPromptFromEmbeddedBasicPrompt(
  embeddedBasicPrompt: EmbeddedBasicPrompt,
  attachmentURLsToIDReferences: Map<string, AttachmentIDReference>,
): BasicPrompt | Error {
  const question = getPromptFieldFromEmbeddedPromptField(
    embeddedBasicPrompt.question,
    attachmentURLsToIDReferences,
  );
  if (question instanceof Error) {
    return question;
  }
  const answer = getPromptFieldFromEmbeddedPromptField(
    embeddedBasicPrompt.answer,
    attachmentURLsToIDReferences,
  );
  if (answer instanceof Error) {
    return answer;
  }

  return {
    promptType: basicPromptType,
    question,
    answer,
    explanation: null,
  };
}

export function getReviewItemFromEmbeddedItem(
  embeddedItem: EmbeddedItem,
  attachmentURLsToIDReferences: Map<string, AttachmentIDReference>,
  attachmentResolutionMap: AttachmentResolutionMap,
): ReviewItem | Error {
  switch (embeddedItem.type) {
    case basicPromptType:
      const prompt = getPromptFromEmbeddedBasicPrompt(
        embeddedItem,
        attachmentURLsToIDReferences,
      );
      if (prompt instanceof Error) {
        return prompt;
      }
      return {
        prompt,
        promptParameters: null,
        promptState: null,
        reviewItemType: promptReviewItemType,
        attachmentResolutionMap,
        ...styles.colors.palettes.red, // TODO
      };
    default:
      return new Error(`Unsupported item type ${embeddedItem.type}`);
  }
}

export function getAttachmentURLsInEmbeddedItem(
  embeddedItem: EmbeddedItem,
): string[] {
  switch (embeddedItem.type) {
    case basicPromptType:
      return [
        ...(embeddedItem.question.attachmentURLs ?? []),
        ...(embeddedItem.answer.attachmentURLs ?? []),
      ];
    default:
      throw new Error(`Unsupported item type ${embeddedItem.type}`);
  }
}
