import {
  AttachmentIDReference,
  AttachmentResolutionMap,
  clozePromptType,
  getIDForPromptTask,
  imageAttachmentType,
  Prompt,
  PromptField,
  PromptID,
  PromptState,
  PromptTask,
  PromptTaskParameters,
  PromptType,
  qaPromptType,
} from "@withorbit/core";
import {
  AttachmentID,
  ClozeTaskContent,
  mainTaskComponentID,
  TaskComponentState,
  TaskContent,
  TaskContentField,
  TaskContentType,
} from "@withorbit/core2";
import { ReviewItem } from "@withorbit/embedded-support";
import { AttachmentStore } from "@withorbit/store-shared";
import { ReviewItem2 } from "./reviewQueue";

function backportTaskContent(content: TaskContent): Prompt {
  function backportClozePromptContents(content: ClozeTaskContent): string {
    const ranges = Object.values(content.components)
      .sort((a, b) => a.order - b.order)
      .map((component) => {
        if (component.ranges.length !== 1) {
          throw new Error(
            `Multiple ranges not supported in cloze content backport ${JSON.stringify(
              content,
              null,
              "\t",
            )}`,
          );
        }

        return component.ranges[0];
      });

    const clozeText = content.body.text;
    let output = "";
    let lastIndex = 0;
    for (const range of ranges) {
      output += clozeText.slice(lastIndex, range.startIndex);
      output += `{${clozeText.substr(range.startIndex, range.length)}}`;
      lastIndex = range.startIndex + range.length;
    }
    output += clozeText.slice(lastIndex);
    return output;
  }

  switch (content.type) {
    case TaskContentType.QA:
      return {
        promptType: qaPromptType,
        question: backportQAPromptContentField(content.body),
        answer: backportQAPromptContentField(content.answer),
      };
    case TaskContentType.Cloze:
      return {
        promptType: clozePromptType,
        body: {
          contents: backportClozePromptContents(content),
          attachments: backportAttachments(content.body.attachments),
        },
      };
    case TaskContentType.Plain:
      throw new Error("Unsupported");
  }

  function backportAttachments(
    attachmentIDs: AttachmentID[],
  ): AttachmentIDReference[] {
    return attachmentIDs.map((id) => ({
      id,
      type: imageAttachmentType,
      byteLength: 0, // it's unused, thankfully, except for ID generation, so we can get away with this.
    }));
  }

  function backportQAPromptContentField(field: TaskContentField): PromptField {
    return {
      contents: field.text,
      attachments: backportAttachments(field.attachments),
    };
  }
}

export async function backportReviewItem(
  reviewItem2: ReviewItem2,
  attachmentStore: AttachmentStore,
): Promise<ReviewItem> {
  const promptParameters: PromptTaskParameters =
    reviewItem2.componentID === mainTaskComponentID
      ? null
      : { clozeIndex: Number.parseInt(reviewItem2.componentID) };
  return {
    promptTaskID: getIDForPromptTask({
      promptType: backportTaskContentType(reviewItem2.task.spec.content),
      promptID: reviewItem2.task.id as string as PromptID,
      promptParameters,
    } as PromptTask),
    promptParameters,
    prompt: backportTaskContent(reviewItem2.task.spec.content),
    promptState: backportComponentState(
      reviewItem2.task.componentStates[reviewItem2.componentID],
    ),
    attachmentResolutionMap: await getAttachmentResolutionMap(
      reviewItem2.task.spec.content,
      attachmentStore,
    ),
  } as ReviewItem;
}

function backportComponentState(
  componentState: TaskComponentState,
): PromptState {
  return {
    bestIntervalMillis: null, // unused,
    dueTimestampMillis: componentState.dueTimestampMillis,
    intervalMillis: componentState.intervalMillis,
    headActionLogIDs: [], // won't be used by the rest of app
    lastReviewTaskParameters: null, // unused
    lastReviewTimestampMillis:
      componentState.lastRepetitionTimestampMillis ??
      componentState.createdAtTimestampMillis,
    needsRetry:
      componentState.lastRepetitionTimestampMillis !== null &&
      componentState.dueTimestampMillis ===
        componentState.lastRepetitionTimestampMillis,
    taskMetadata: { isDeleted: false, provenance: null }, // TODO maybe backport provenance
  };
}

function backportTaskContentType(content: TaskContent): PromptType {
  switch (content.type) {
    case TaskContentType.QA:
      return qaPromptType;
    case TaskContentType.Cloze:
      return clozePromptType;
    case TaskContentType.Plain:
      throw new Error("Unsupported");
  }
}

async function getAttachmentResolutionMap(
  content: TaskContent,
  attachmentStore: AttachmentStore,
): Promise<AttachmentResolutionMap> {
  const output: AttachmentResolutionMap = new Map();
  for (const id of getAttachmentIDsInContent(content)) {
    const url = await attachmentStore.getURLForStoredAttachment(id);
    if (!url) {
      throw new Error(`No attachment stored for ID ${id}`);
    }
    output.set(id, {
      url,
      type: imageAttachmentType,
    });
  }
  return output;
}

function getAttachmentIDsInContent(content: TaskContent): AttachmentID[] {
  switch (content.type) {
    case TaskContentType.QA:
      return [...content.body.attachments, ...content.answer.attachments];
    case TaskContentType.Cloze:
      return content.body.attachments;
    case TaskContentType.Plain:
      throw new Error("Unsupported");
  }
}
