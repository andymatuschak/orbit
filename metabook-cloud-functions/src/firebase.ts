import * as firebase from "firebase-admin";
import {
  ActionLog,
  applyActionLogToPromptState,
  Attachment,
  AttachmentID,
  getIDForAttachment,
  getIDForPrompt,
  getPromptActionLogFromActionLog,
  Prompt,
  promptActionLogCanBeAppliedToPromptState,
  PromptID,
  PromptState,
} from "metabook-core";
import {
  getReferenceForAttachmentID,
  getReferenceForPromptID,
  getTaskStateCacheReferenceForTaskID,
  PromptStateCache,
} from "metabook-firebase-shared";

let _database: firebase.firestore.Firestore | null = null;
function getDatabase(): firebase.firestore.Firestore {
  if (!_database) {
    const app = firebase.initializeApp();
    _database = app.firestore();
  }
  return _database;
}

export function recordPrompts(prompts: Prompt[]): Promise<PromptID[]> {
  // TODO probably add something about provenance
  // TODO something about user quotas, billing
  return Promise.all(
    prompts.map(async (promptData) => {
      const promptID = getIDForPrompt(promptData);
      const dataRef = getReferenceForPromptID(getDatabase(), promptID);
      await dataRef
        .create(promptData)
        .then(() => {
          console.log("Recorded prompt spec", promptID, promptData);
        })
        .catch(() => {
          return;
        });
      return promptID as PromptID;
    }),
  );
}

export function recordAttachments(
  attachments: Attachment[],
): Promise<AttachmentID[]> {
  // TODO probably add something about provenance
  // TODO something about user quotas, billing
  return Promise.all(
    attachments.map(async (attachment) => {
      const attachmentID = getIDForAttachment(
        Buffer.from(attachment.contents, "binary"),
      );
      const dataRef = getReferenceForAttachmentID(getDatabase(), attachmentID);
      await dataRef
        .create(attachment)
        .then(() => {
          console.log("Recorded attachment", attachmentID);
        })
        .catch(() => {
          return;
        });
      return attachmentID as AttachmentID;
    }),
  );
}

export async function updatePromptStateCacheWithLog(
  log: ActionLog,
  userID: string,
) {
  const db = getDatabase();
  const promptStateCacheReference = getTaskStateCacheReferenceForTaskID(
    db,
    userID,
    log.taskID,
  );
  const promptActionLog = getPromptActionLogFromActionLog(log);
  return db.runTransaction(async (transaction) => {
    const promptStateCacheSnapshot = await transaction.get(
      promptStateCacheReference,
    );
    const basePromptState =
      (promptStateCacheSnapshot.data() as PromptState) ?? null;
    if (
      promptActionLogCanBeAppliedToPromptState(promptActionLog, basePromptState)
    ) {
      const newPromptState = applyActionLogToPromptState({
        basePromptState,
        promptActionLog,
        schedule: "default",
      });
      if (newPromptState instanceof Error) {
        throw new Error(
          `Error applying log to prompt state: ${newPromptState}.\nLog: ${JSON.stringify(
            promptActionLog,
            null,
            "\t",
          )}\nBase prompt state: ${JSON.stringify(
            basePromptState,
            null,
            "\t",
          )}`,
        );
      }
      const promptStateCache: PromptStateCache<firebase.firestore.Timestamp> = {
        ...newPromptState,
        taskID: log.taskID,
        lastUpdateTimestamp: firebase.firestore.FieldValue.serverTimestamp() as firebase.firestore.Timestamp,
      };
      transaction.set(promptStateCacheReference, promptStateCache);
    } else {
      throw new Error(
        `Can't apply log to prompt state: ${JSON.stringify(
          promptActionLog,
          null,
          "\t",
        )}, ${JSON.stringify(basePromptState, null, "\t")}`,
      );
    }
  });
}
