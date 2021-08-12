import {
  ActionLog,
  ActionLogID,
  getPromptActionLogFromActionLog,
  getPromptTaskForID,
  Prompt,
  PromptID,
} from "@withorbit/core";
import express from "express";
import * as backend from "../../backend";
import { writeConvertedLogsToCore2Storage } from "../util/writeConvertedLogsToCore2Storage";

export async function migrateUserImpl(userID: string) {
  console.log(`Migrating ${userID}`);
  const metadata = await backend.users.getUserMetadata(userID);
  if (metadata?.core2MigrationTimestampMillis) {
    console.warn(`Skipping ${userID} because they have already been migrated`);
    return;
  }

  let afterID: ActionLogID | undefined = undefined;
  const promptCache = new Map<PromptID, Prompt>();
  do {
    console.log(`Fetching logs after ${afterID}`);
    const logs: Map<ActionLogID, ActionLog> =
      await backend.actionLogs.listActionLogs(userID, {
        limit: 100,
        createdAfterID: afterID,
      });

    const missingPromptIDs = new Set<PromptID>();
    for (const [id, log] of logs.entries()) {
      const promptLog = getPromptActionLogFromActionLog(log);
      const promptTask = getPromptTaskForID(promptLog.taskID);
      if (promptTask instanceof Error) {
        throw new Error(
          `Couldn't parse prompt task ID ${log.taskID} in log ID ${id}`,
        );
      }

      if (!promptCache.has(promptTask.promptID)) {
        missingPromptIDs.add(promptTask.promptID);
      }
    }

    if (missingPromptIDs.size > 0) {
      const promptContent = await backend.prompts.getPrompts([
        ...missingPromptIDs,
      ]);
      for (const [promptID, prompt] of promptContent) {
        promptCache.set(promptID, prompt);
      }
    }

    const entries = [...logs.entries()];
    await writeConvertedLogsToCore2Storage(
      entries.map(([id, data]) => ({ id, data })),
      userID,
      async () => promptCache,
    );

    if (entries.length > 0) {
      const nextID = entries[entries.length - 1][0];
      console.log(`Migrated up through ${afterID}\n`);
      if (nextID == afterID) {
        console.log(`Current afterID is ${afterID}; new ID is same; breaking.`);
        break;
      }
      afterID = nextID;
    } else {
      console.log(`Finished migrating ${userID}\n.`);
      break;
    }
  } while (afterID !== undefined);

  await backend.users.updateUserMetadata(userID, {
    core2MigrationTimestampMillis: Date.now()
  })
}

export async function migrateUser(
  request: express.Request,
  response: express.Response,
) {
  const userID = request.query.userID as string;
  await migrateUserImpl(userID);

  response.sendStatus(200);
}
