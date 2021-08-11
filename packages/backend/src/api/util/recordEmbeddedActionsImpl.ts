import {
  ActionLog,
  getIDForActionLogSync,
  Prompt,
  PromptID,
} from "@withorbit/core";
import functions from "firebase-functions";
import * as backend from "../../backend";
import { sharedLoggingService } from "../../logging";
import { writeConvertedLogsToCore2Storage } from "./writeConvertedLogsToCore2Storage";

export interface RecordEmbeddedActionsArguments {
  logs: ActionLog[];
  promptsByID: { [key: string]: Prompt };
}

async function storePrompts(promptsByID: {
  [key: string]: Prompt;
}): Promise<void> {
  const storedPromptIDs = await backend.prompts.storePrompts(
    Object.values(promptsByID),
  );

  // Let's make sure those IDs all line up.
  const promptEntries = Object.entries(promptsByID);
  const mismatchedPromptIDs = storedPromptIDs.filter(
    (promptID, index) => promptID !== promptEntries[index][0],
  );
  if (mismatchedPromptIDs.length > 0) {
    throw new Error(
      `Prompts don't match their IDs (server/client version mismatch?): ${mismatchedPromptIDs.join(
        ", ",
      )}`,
    );
  }
}

async function storeLogs(userID: string, logs: ActionLog[]): Promise<void> {
  const storedResults = await backend.actionLogs.storeActionLogs(userID, logs);
  await Promise.all(
    storedResults.map(({ log, serverTimestampMillis, promptState }) =>
      sharedLoggingService.logActionLog({
        userID: userID,
        actionLog: log,
        serverTimestamp: serverTimestampMillis,
        newTaskState: promptState,
      }),
    ),
  );
}

// TODO: Remove this function; migrate clients to public APIs.
export async function recordEmbeddedActions(
  args: RecordEmbeddedActionsArguments,
  userID: string,
): Promise<void> {
  try {
    console.log("Recording embedded actions", args);

    // Store prompts as needed
    await storePrompts(args.promptsByID);

    // Store logs
    await storeLogs(userID, args.logs);

    await writeConvertedLogsToCore2Storage(
      args.logs.map((log) => ({ id: getIDForActionLogSync(log), data: log })),
      userID,
      async () =>
        new Map(Object.entries(args.promptsByID)) as Map<PromptID, Prompt>,
    );
  } catch (error) {
    console.error(error.message);
    throw new functions.https.HttpsError("internal", error.message);
  }
}
