import { MetabookDataSnapshot, MetabookUserClient } from "metabook-client";
import {
  AttachmentID,
  getDuePromptTasks,
  getPromptTaskForID,
  Prompt,
  PromptField,
  PromptID,
  PromptState,
  PromptTask,
  QAPrompt,
} from "metabook-core";
import {
  PromptReviewItem,
  promptReviewItemType,
  ReviewItem,
} from "metabook-ui";
import DataRecordClient from "./dataRecordClient";
import PromptStateStore from "./promptStateStore";

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

function getAttachmentIDsInPrompts(
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

function getPromptIDsInPromptTasks(
  promptTasks: Iterable<PromptTask>,
): Set<PromptID> {
  const output: Set<PromptID> = new Set();
  for (const promptTask of promptTasks) {
    output.add(promptTask.promptID);
  }
  return output;
}

async function getInitialDuePromptStates(
  promptStateStore: PromptStateStore,
  userClient: MetabookUserClient,
  dueBeforeTimestampMillis: number,
): Promise<Map<PromptTask, PromptState>> {
  if (await promptStateStore.getHasFinishedInitialImport()) {
    console.log("Review queue: getting prompt data from cache");
    return promptStateStore.getDuePromptStates(dueBeforeTimestampMillis);
  } else {
    console.log("Review queue: getting prompt data from server");
    const promptStateCaches = await userClient.getPromptStates({
      dueBeforeTimestampMillis,
    });
    const outputMap = new Map<PromptTask, PromptState>();
    for (const cache of promptStateCaches) {
      const promptTask = getPromptTaskForID(cache.taskID);
      if (promptTask instanceof Error) {
        console.error("Unparseable task ID", cache.taskID, promptTask);
      } else {
        outputMap.set(promptTask, cache);
      }
    }
    return outputMap;
  }
}

async function getReviewItemsForPromptStates(
  orderedDuePromptTasks: PromptTask[],
  promptStates: Map<PromptTask, PromptState>,
  dataRecordClient: DataRecordClient,
): Promise<ReviewItem[]> {
  const promptIDs = getPromptIDsInPromptTasks(orderedDuePromptTasks);

  console.log("Review queue: fetching prompt data");
  const prompts = await dataRecordClient.getPrompts(promptIDs);
  console.log("Review queue: fetched prompt data");

  const attachmentIDs = getAttachmentIDsInPrompts(prompts);
  console.log("Review queue: fetching attachments");
  const attachmentResolutionMap = await dataRecordClient.getAttachments(
    attachmentIDs,
  );
  // TODO: filter out prompts with missing attachments?
  console.log("Review queue: fetched attachments");

  return orderedDuePromptTasks
    .map((promptTask) => {
      // TODO validate that task spec, task state, and task parameter types all match up... or, better, design the API to ensure that more reasonably
      const prompt = prompts.get(promptTask.promptID);
      if (!prompt) {
        return null;
      }
      return {
        reviewItemType: promptReviewItemType,
        prompt,
        promptState: promptStates.get(promptTask)!,
        promptParameters: promptTask.promptParameters,
        attachmentResolutionMap,
      } as PromptReviewItem;
    })
    .filter((item): item is ReviewItem => !!item);
}

export default async function fetchReviewItemQueue({
  promptStateStore,
  dataRecordClient,
  userClient,
  dueBeforeTimestampMillis,
}: {
  promptStateStore: PromptStateStore;
  dataRecordClient: DataRecordClient;
  userClient: MetabookUserClient;
  dueBeforeTimestampMillis: number;
}) {
  console.log("Review queue: fetching due prompt states");
  const duePromptStates = await getInitialDuePromptStates(
    promptStateStore,
    userClient,
    dueBeforeTimestampMillis,
  );
  console.log("Review queue: fetched due prompt states");

  const orderedDuePromptTasks = getDuePromptTasks({
    promptStates: duePromptStates,
    reviewSessionIndex: 0, // TODO
    timestampMillis: dueBeforeTimestampMillis,
    cardsCompletedInCurrentSession: 0, // TODO
  });

  return await getReviewItemsForPromptStates(
    orderedDuePromptTasks,
    duePromptStates,
    dataRecordClient,
  );
}
