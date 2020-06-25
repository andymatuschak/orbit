import { MetabookUserClient } from "metabook-client";
import {
  getDuePromptTasks,
  getPromptTaskForID,
  PromptID,
  PromptState,
  PromptTask,
} from "metabook-core";
import {
  PromptReviewItem,
  promptReviewItemType,
  ReviewItem,
} from "metabook-ui";
import { getAttachmentIDsInPrompts } from "../util/getAttachmentIDsInPrompts";
import actionLogStore from "./actionLogStore";
import DataRecordManager from "./dataRecordManager";
import PromptStateStore from "./promptStateStore";

const reviewQueueLengthLimit = 100; // TODO: this isn't the right place for this.

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
  limit: number,
  hasFinishedInitialImport: boolean,
): Promise<Map<PromptTask, PromptState>> {
  if (hasFinishedInitialImport) {
    console.log("Review queue: getting prompt data from cache");
    return promptStateStore.getDuePromptStates(dueBeforeTimestampMillis, limit);
  } else {
    console.log("Review queue: getting prompt data from server");
    const promptStateCaches = await userClient.getPromptStates({
      limit,
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
  dataRecordManager: DataRecordManager,
): Promise<ReviewItem[]> {
  const promptIDs = getPromptIDsInPromptTasks(orderedDuePromptTasks);

  console.log("Review queue: fetching prompt data");
  const prompts = await dataRecordManager.getPrompts(promptIDs);
  console.log("Review queue: fetched prompt data");

  const attachmentIDs = getAttachmentIDsInPrompts(prompts.values());
  console.log("Review queue: fetching attachments");
  const attachmentResolutionMap = await dataRecordManager.getAttachments(
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
  dataRecordManager,
  userClient,
  dueBeforeTimestampMillis,
  hasFinishedInitialImport,
}: {
  promptStateStore: PromptStateStore;
  dataRecordManager: DataRecordManager;
  userClient: MetabookUserClient;
  dueBeforeTimestampMillis: number;
  hasFinishedInitialImport: boolean;
}) {
  console.log("Review queue: fetching due prompt states");
  const duePromptStates = await getInitialDuePromptStates(
    promptStateStore,
    userClient,
    dueBeforeTimestampMillis,
    reviewQueueLengthLimit,
    hasFinishedInitialImport,
  );
  console.log(
    `Review queue: fetched ${duePromptStates.size} due prompt states`,
  );

  const orderedDuePromptTasks = getDuePromptTasks({
    promptStates: duePromptStates,
    reviewSessionIndex: 0, // TODO
    timestampMillis: dueBeforeTimestampMillis,
    cardsCompletedInCurrentSession: 0, // TODO
  });

  return await getReviewItemsForPromptStates(
    orderedDuePromptTasks,
    duePromptStates,
    dataRecordManager,
  );
}
