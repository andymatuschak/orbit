import OrbitAPIClient from "@withorbit/api-client";
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
} from "@withorbit/core";
import { ReviewItem } from "@withorbit/embedded-support";
import { Platform } from "react-native";

import { getAttachmentIDsInPrompts } from "../util/getAttachmentIDsInPrompts";
import DataRecordManager from "./dataRecordManager";
import PromptStateStore from "./promptStateStore";

const initialReviewQueueFetchLimit = 100; // TODO: this isn't the right place for this.

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
  apiClient: OrbitAPIClient,
  dueBeforeTimestampMillis: number,
  limit: number,
  hasFinishedInitialImport: boolean,
): Promise<Map<PromptTaskID, PromptState>> {
  // HACK: Disabling local storage on web until I think through resilience more carefully.
  if (hasFinishedInitialImport && Platform.OS !== "web") {
    console.log("Review queue: getting prompt data from cache");
    return promptStateStore.getDuePromptStates(dueBeforeTimestampMillis, limit);
  } else {
    console.log("Review queue: getting prompt data from server");
    const results = await apiClient.listTaskStates({
      limit,
      dueBeforeTimestampMillis,
    });
    const outputMap = new Map<PromptTaskID, PromptState>();
    for (const { id, data } of results.data) {
      outputMap.set(id, data);
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
  apiClient,
  nowTimestampMillis,
  hasFinishedInitialImport,
}: {
  promptStateStore: PromptStateStore;
  dataRecordManager: DataRecordManager;
  apiClient: OrbitAPIClient;
  nowTimestampMillis: number;
  hasFinishedInitialImport: boolean;
}) {
  console.log("Review queue: fetching due prompt states");
  const duePromptStates = await getInitialDuePromptStates(
    promptStateStore,
    apiClient,
    nowTimestampMillis,
    initialReviewQueueFetchLimit,
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
