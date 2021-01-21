import {
  AttachmentIDReference,
  clozePromptType,
  getIDForPromptSync,
  getIDForPromptTask,
  Prompt,
  PromptField,
  PromptParameters,
  PromptTask,
  QAPrompt,
  qaPromptType,
} from "metabook-core";
import {
  EmbeddedItem,
  EmbeddedPromptField,
  EmbeddedQAPrompt,
  ReviewItem,
} from "metabook-embedded-support";
import { AttachmentResolutionMap } from "metabook-ui";

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

function getPromptFromEmbeddedQAPrompt(
  embeddedQAPrompt: EmbeddedQAPrompt,
  attachmentURLsToIDReferences: Map<string, AttachmentIDReference>,
): QAPrompt | Error {
  const question = getPromptFieldFromEmbeddedPromptField(
    embeddedQAPrompt.question,
    attachmentURLsToIDReferences,
  );
  if (question instanceof Error) {
    return question;
  }
  const answer = getPromptFieldFromEmbeddedPromptField(
    embeddedQAPrompt.answer,
    attachmentURLsToIDReferences,
  );
  if (answer instanceof Error) {
    return answer;
  }

  return {
    promptType: qaPromptType,
    question,
    answer,
  };
}

export function getReviewItemFromEmbeddedItem({
  embeddedItem,
  attachmentURLsToIDReferences,
  attachmentResolutionMap,
}: {
  embeddedItem: EmbeddedItem;
  attachmentURLsToIDReferences: Map<string, AttachmentIDReference>;
  attachmentResolutionMap: AttachmentResolutionMap;
}): ReviewItem | Error {
  let prompt: Prompt;
  let promptParameters: PromptParameters;

  switch (embeddedItem.type) {
    case qaPromptType:
      const result = getPromptFromEmbeddedQAPrompt(
        embeddedItem,
        attachmentURLsToIDReferences,
      );
      if (result instanceof Error) {
        return result;
      }
      prompt = result;
      promptParameters = null;
      break;

    case clozePromptType:
      const body = getPromptFieldFromEmbeddedPromptField(
        embeddedItem.body,
        attachmentURLsToIDReferences,
      );
      if (body instanceof Error) {
        return body;
      }
      prompt = { promptType: clozePromptType, body };
      promptParameters = { clozeIndex: 0 };
      break;
  }

  return {
    prompt,
    promptParameters,
    promptState: null,

    attachmentResolutionMap,
    promptTaskID: getIDForPromptTask({
      promptID: getIDForPromptSync(prompt),
      promptParameters,
      promptType: prompt.promptType,
    } as PromptTask),
  };
}

export function getAttachmentURLsInEmbeddedItem(
  embeddedItem: EmbeddedItem,
): string[] {
  switch (embeddedItem.type) {
    case qaPromptType:
      return [
        ...(embeddedItem.question.attachmentURLs ?? []),
        ...(embeddedItem.answer.attachmentURLs ?? []),
      ];

    case clozePromptType:
      return embeddedItem.body.attachmentURLs ?? [];
  }
}
