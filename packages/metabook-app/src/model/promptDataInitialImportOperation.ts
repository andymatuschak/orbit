import { getPromptTaskForID, PromptState, PromptTaskID } from "metabook-core";
import { getAttachmentIDsInPrompts } from "../util/getAttachmentIDsInPrompts";
import { createTask, Task } from "../util/task";
import DataRecordManager from "./dataRecordManager";
import PromptStateStore from "./promptStateStore";

export default function promptDataInitialImportOperation(
  dataRecordManager: DataRecordManager,
  promptStateStore: PromptStateStore,
): Task<void> {
  return createTask(async (taskStatus) => {
    let latestPromptTaskID: PromptTaskID | null = null;
    let promptTotal = 0;
    let attachmentTotal = 0;
    console.log("Prompt data import: starting");
    while (!taskStatus.isCancelled) {
      const promptStates: Map<
        PromptTaskID,
        PromptState
      > = await promptStateStore.getAllPromptStates(latestPromptTaskID, 100);
      if (taskStatus.isCancelled) return;

      if (promptStates.size > 0) {
        const orderedPromptTaskIDs = [...promptStates.keys()];
        const promptIDs = new Set(
          orderedPromptTaskIDs.map((promptTaskID) => {
            const promptTask = getPromptTaskForID(promptTaskID);
            if (promptTask instanceof Error) {
              throw promptTask;
            }
            return promptTask.promptID;
          }),
        );
        const prompts = await dataRecordManager.getPrompts(promptIDs);
        if (taskStatus.isCancelled) return;

        console.log(
          `Prompt data import: imported ${prompts.size} prompt records (${promptTotal} total)`,
        );

        const attachmentIDs = getAttachmentIDsInPrompts(prompts.values());
        if (attachmentIDs.size > 0) {
          const attachments = await dataRecordManager.getAttachments(
            attachmentIDs,
          );
          attachmentTotal += attachments.size;
          console.log(
            `Attachment data import: imported ${attachments.size} attachments (${attachmentTotal} total)`,
          );
        }

        promptTotal += prompts.size;
        latestPromptTaskID =
          orderedPromptTaskIDs[orderedPromptTaskIDs.length - 1];
      } else {
        console.log("Prompt data import: finished");
        break;
      }
    }
  });
}
