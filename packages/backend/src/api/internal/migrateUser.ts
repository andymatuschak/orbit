import {
  ActionLog,
  ActionLogID,
  getIDForActionLogSync,
  getPromptActionLogFromActionLog,
  getPromptTaskForID,
  IngestActionLog,
  ingestActionLogType,
  Prompt,
  PromptID,
} from "@withorbit/core";
import { migration } from "@withorbit/core2";
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
  const seenPromptIDs = new Set<string>();
  do {
    console.log(`Fetching logs after ${afterID}`);
    const logs: Map<ActionLogID, ActionLog> =
      await backend.actionLogs.listActionLogs(userID, {
        limit: 100,
        createdAfterID: afterID,
      });

    const missingPromptIDs = new Set<PromptID>();
    const entries: [ActionLogID, ActionLog][] = [];
    for (const [id, log] of logs.entries()) {
      const promptLog = getPromptActionLogFromActionLog(log);
      const promptTask = getPromptTaskForID(promptLog.taskID);
      if (promptTask instanceof Error) {
        throw new Error(
          `Couldn't parse prompt task ID ${log.taskID} in log ID ${id}`,
        );
      }

      if (!seenPromptIDs.has(promptTask.promptID)) {
        if (log.actionLogType !== ingestActionLogType) {
          console.log(
            `Encountering log of type ${log.actionLogType} for ${
              log.taskID
            } (future entity ID ${migration.convertCore1ID(
              promptTask.promptID,
            )} before ingestion`,
          );
          const ingestLog: IngestActionLog = {
            actionLogType: ingestActionLogType,
            taskID: log.taskID,
            timestampMillis: log.timestampMillis,
            provenance: null,
          };
          entries.push([getIDForActionLogSync(ingestLog), ingestLog]);
        }

        seenPromptIDs.add(promptTask.promptID);
      }

      if (!promptCache.has(promptTask.promptID)) {
        missingPromptIDs.add(promptTask.promptID);
      }

      entries.push([id, log]);
    }

    if (missingPromptIDs.size > 0) {
      const promptContent = await backend.prompts.getPrompts([
        ...missingPromptIDs,
      ]);
      for (const [promptID, prompt] of promptContent) {
        promptCache.set(promptID, prompt);
      }
    }

    await writeConvertedLogsToCore2Storage(
      entries.map(([id, data]) => ({ id, data })),
      userID,
      async () => promptCache,
    );
    if (entries.length > 0) {
      const nextID = entries[entries.length - 1][0];
      console.log(`Migrated up through ${nextID}\n`);
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
    core2MigrationTimestampMillis: Date.now(),
    activeTaskCount: seenPromptIDs.size
  });
}

export async function migrateUser(
  request: express.Request,
  response: express.Response,
) {
  const userID = request.query.userID as string;
  await migrateUserImpl(userID);

  response.sendStatus(200);
}
