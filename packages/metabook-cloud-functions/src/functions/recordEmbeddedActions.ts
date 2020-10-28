import * as functions from "firebase-functions";
import { ActionLog, AttachmentID, Prompt } from "metabook-core";
import * as backend from "../backend";
import { defaultLoggingService } from "../logging";

interface RecordEmbeddedActionsArguments {
  logs: ActionLog[];
  promptsByID: { [key: string]: Prompt };
  attachmentURLsByID: { [key: string]: string };
}

async function storeAttachments(attachmentURLsByID: { [key: string]: string }) {
  await Promise.all(
    Object.entries(attachmentURLsByID).map(([attachmentID, url]) =>
      backend.attachments.storeAttachmentIfNecessary(
        attachmentID as AttachmentID,
        url,
      ),
    ),
  );
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
      defaultLoggingService.logActionLog(userID, logDocument, promptState),
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

    // Store attachments as needed
    await storeAttachments(args.attachmentURLsByID);

    // Store prompts as needed
    await storePrompts(args.promptsByID);

    // Store logs
    await storeLogs(context.auth.uid, args.logs);
  } catch (error) {
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
});
