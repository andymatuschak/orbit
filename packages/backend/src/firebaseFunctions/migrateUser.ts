import {
  ActionLog,
  ActionLogID,
  getPromptActionLogFromActionLog,
  getPromptTaskForID,
  Prompt,
  PromptID,
} from "@withorbit/core";
import * as functions from "firebase-functions";
import { writeConvertedLogsToCore2Storage } from "../api/util/writeConvertedLogsToCore2Storage";
import * as backend from "../backend";

export default functions.https.onCall(async (args) => {
  const { userID } = args;

  console.log(`Migrating ${userID}`)

  let afterID: ActionLogID | undefined = undefined;
  const promptCache = new Map<PromptID, Prompt>();
  while (true) {
    const logs: Map<ActionLogID, ActionLog> =
      await backend.actionLogs.listActionLogs(userID, {
        limit: 1000,
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
    writeConvertedLogsToCore2Storage(
      entries.map(([id, data]) => ({ id, data })),
      userID,
      async () => promptCache,
    );

    if (logs.size > 0) {
      afterID = entries[entries.length - 1][0];
      console.log(`Migrated up through ${afterID}`);
    } else {
      console.log(`Finished migrating ${userID}.`);
      break;
    }
  }
});
