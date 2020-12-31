import { MetabookUserClient } from "metabook-client";
import {
  AttachmentID,
  AttachmentURLReference,
  getIDForPromptTask,
  getPromptTaskForID,
  Prompt,
  PromptID,
  PromptState,
  PromptTask,
  PromptTaskID,
  reviewSession,
} from "metabook-core";

import { getAttachmentIDsInPrompts } from "../util/getAttachmentIDsInPrompts";
import DataRecordManager from "./dataRecordManager";
import PromptStateStore from "./promptStateStore";
import { ReviewItem } from "./reviewItem";

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
): Promise<Map<PromptTaskID, PromptState>> {
  if (hasFinishedInitialImport) {
    console.log("Review queue: getting prompt data from cache");
    return promptStateStore.getDuePromptStates(dueBeforeTimestampMillis, limit);
  } else {
    console.log("Review queue: getting prompt data from server");
    const promptStateCaches = await userClient.getPromptStates({
      limit,
      dueBeforeTimestampMillis,
    });
    const outputMap = new Map<PromptTaskID, PromptState>();
    for (const cache of promptStateCaches) {
      outputMap.set(cache.taskID, cache);
    }
    return outputMap;
  }
}

async function resolveAttachments(
  dataRecordManager: DataRecordManager,
  prompts: Iterable<Prompt>,
): Promise<Map<AttachmentID, AttachmentURLReference>> {
  const attachmentIDs = getAttachmentIDsInPrompts(prompts);
  console.log("Review queue: fetching attachments");
  const attachmentResolutionMap = await dataRecordManager.getAttachments(
    attachmentIDs,
  );
  // TODO: filter out prompts with missing attachments?
  console.log("Review queue: fetched attachments");
  return attachmentResolutionMap;
}

async function resolveReviewItems(
  orderedDuePromptTaskIDs: PromptTaskID[],
  promptStates: Map<PromptTaskID, PromptState>,
  dataRecordManager: DataRecordManager,
): Promise<ReviewItem[]> {
  const orderedDuePromptTasks = orderedDuePromptTaskIDs.map((promptTaskID) => {
    const promptTask = getPromptTaskForID(promptTaskID);
    if (promptTask instanceof Error) {
      throw new Error(
        `Can't parse prompt task ID: ${promptTaskID}: ${promptTask}`,
      );
    }
    return promptTask;
  });

  const promptIDs = getPromptIDsInPromptTasks(orderedDuePromptTasks);

  console.log("Review queue: fetching prompt data");
  const prompts = await dataRecordManager.getPrompts(promptIDs);
  console.log("Review queue: fetched prompt data");

  const attachmentResolutionMap = await resolveAttachments(
    dataRecordManager,
    prompts.values(),
  );

  return orderedDuePromptTasks
    .map((promptTask): ReviewItem | null => {
      // TODO validate that task spec, task state, and task parameter types all match up... or, better, design the API to ensure that more reasonably
      const prompt = prompts.get(promptTask.promptID);
      if (!prompt) {
        return null;
      }

      const promptTaskID = getIDForPromptTask(promptTask);
      return {
        prompt,
        promptParameters: promptTask.promptParameters,
        promptState: promptStates.get(promptTaskID) ?? null,
        promptTaskID,
        attachmentResolutionMap,
      };
    })
    .filter((item): item is ReviewItem => !!item);
}

export default async function fetchReviewItemQueue({
  promptStateStore,
  dataRecordManager,
  userClient,
  nowTimestampMillis,
  hasFinishedInitialImport,
}: {
  promptStateStore: PromptStateStore;
  dataRecordManager: DataRecordManager;
  userClient: MetabookUserClient;
  nowTimestampMillis: number;
  hasFinishedInitialImport: boolean;
}) {
  console.log("Review queue: fetching due prompt states");
  const duePromptStates = await getInitialDuePromptStates(
    promptStateStore,
    userClient,
    nowTimestampMillis,
    reviewQueueLengthLimit,
    hasFinishedInitialImport,
  );
  console.log(
    `Review queue: fetched ${duePromptStates.size} due prompt states`,
  );

  const orderedDuePromptTasks = reviewSession.getDuePromptTasks({
    promptStates: duePromptStates,
    thresholdTimestampMillis: reviewSession.getFuzzyDueTimestampThreshold(
      nowTimestampMillis,
    ),
  });

  return await resolveReviewItems(
    orderedDuePromptTasks,
    duePromptStates,
    dataRecordManager,
  );
}
