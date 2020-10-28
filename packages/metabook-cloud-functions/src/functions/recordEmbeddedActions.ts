import * as functions from "firebase-functions";
import { ActionLog, AttachmentID, Prompt } from "metabook-core";
import * as backend from "../backend";

interface RecordEmbeddedActionsArguments {
  logs: ActionLog[];
  promptsByID: { [key: string]: Prompt };
  attachmentURLsByID: { [key: string]: string };
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
    await Promise.all(
      Object.entries(args.attachmentURLsByID).map(([attachmentID, url]) =>
        backend.attachments.storeAttachmentIfNecessary(
          attachmentID as AttachmentID,
          url,
        ),
      ),
    );

    // Store prompts as needed
    await backend.prompts.storePromptsIfNecessary(args.promptsByID);

    // Store logs
    await backend.actionLogs.storeLogs(args.logs, context.auth.uid);
  } catch (error) {
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
});
