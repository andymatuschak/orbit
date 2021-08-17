import {
  ActionLog,
  ActionLogID,
  applicationPromptType,
  AttachmentID,
  clozePromptType,
  getPromptActionLogFromActionLog,
  getPromptTaskForID,
  ingestActionLogType,
  Prompt,
  PromptID,
  qaPromptType,
} from "@withorbit/core";
import {
  AttachmentIngestEvent,
  Event,
  EventType,
  migration,
} from "@withorbit/core2";
import * as backend from "../../backend";
import { putAndLogEvents } from "../2/util/putAndLogEvents";

export async function writeConvertedLogsToCore2Storage(
  logs: { id: ActionLogID; data: ActionLog }[],
  userID: string,
  getPrompts: (promptIDs: PromptID[]) => Promise<Map<PromptID, Prompt>>,
) {
  const promptActionLogs = logs.map(({ id, data }) => ({
    id,
    log: getPromptActionLogFromActionLog(data),
  }));
  const promptIDs = new Set(
    promptActionLogs.map(({ log }) => {
      const promptTask = getPromptTaskForID(log.taskID);
      if (promptTask instanceof Error) {
        throw promptTask;
      }
      return promptTask.promptID;
    }),
  );

  const prompts = await getPrompts([...promptIDs]);
  const migratedEvents: Event[] = [];
  for (const { id, log } of promptActionLogs) {
    const promptTask = getPromptTaskForID(log.taskID);
    if (promptTask instanceof Error) {
      throw promptTask;
    }
    const prompt = prompts.get(promptTask.promptID);
    if (!prompt) {
      console.error(`Unknown prompt with ID ${promptTask.promptID}`);
      continue;
    }

    // Migrate attachments if needed
    if (log.actionLogType === ingestActionLogType) {
      let attachmentIDs: AttachmentID[];
      switch (prompt.promptType) {
        case qaPromptType:
          attachmentIDs = prompt.question.attachments
            .map(({ id }) => id)
            .concat(prompt.answer.attachments.map(({ id }) => id));
          break;
        case clozePromptType:
          attachmentIDs = prompt.body.attachments.map(({ id }) => id);
          break;
        case applicationPromptType:
          throw new Error("Unsupported migration of application prompt");
      }

      try {
        await backend.attachments.migrateAttachmentIDs(userID, attachmentIDs);
      } catch (error) {
        throw new Error(`Failed to migrate attachment ${error}`);
      }

      for (const attachmentID of new Set(attachmentIDs)) {
        try {
          const mimeType = await backend.attachments.getAttachmentMIMEType(
            attachmentID,
          );
          if (!mimeType) {
            throw new Error(`Unexpected missing attachment: ${attachmentID}`);
          }
          const attachmentIngestEvent: AttachmentIngestEvent = {
            type: EventType.AttachmentIngest,
            id: migration.convertCore1ID(`${id}_${attachmentID}`),
            entityID: migration.convertCore1ID(attachmentID),
            timestampMillis: log.timestampMillis,
            mimeType,
          };
          migratedEvents.push(attachmentIngestEvent);
        } catch (error) {
          console.warn(`Skipping attachment ingest for ${attachmentID}`);
        }
      }
    }

    migratedEvents.push(...migration.convertCore1ActionLog(log, id, prompt));
  }

  await putAndLogEvents(userID, migratedEvents);
}
