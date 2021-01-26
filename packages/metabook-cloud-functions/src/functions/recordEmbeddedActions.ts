import * as functions from "firebase-functions";
import { ActionLog, Prompt } from "metabook-core";
import * as backend from "../backend";
import { sharedLoggingService } from "../logging";

interface RecordEmbeddedActionsArguments {
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
  const storedResults = await backend.actionLogs.storeLogs(logs, userID);
  await Promise.all(
    storedResults.map(({ logDocument, promptState }) =>
      sharedLoggingService.logActionLog(userID, logDocument, promptState),
    ),
  );
}

export default functions.https.onCall(async function (
  args: RecordEmbeddedActionsArguments,
  context: functions.https.CallableContext,
): Promise<void> {
  // TODO: validate arguments
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "this operation requires authentication",
    );
  }

  try {
    console.log("Recording embedded actions", args);

    // Store prompts as needed
    await storePrompts(args.promptsByID);

    // Store logs
    await storeLogs(context.auth.uid, args.logs);
  } catch (error) {
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
});
