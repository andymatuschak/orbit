import {
  ActionLog,
  ActionLogID,
  getPromptActionLogFromActionLog,
  getPromptTaskForID,
  Prompt,
  PromptID,
} from "@withorbit/core";
import { Event, migration } from "@withorbit/core2";
import { Database } from "@withorbit/store-shared";
import { FirestoreDatabaseBackend } from "../../backend/2/firestoreDatabaseBackend";

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

    migratedEvents.push(...migration.convertCore1ActionLog(log, id, prompt));
  }
  const db = new Database(new FirestoreDatabaseBackend(userID));
  await db.putEvents(migratedEvents);
}
