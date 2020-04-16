import * as firebase from "firebase-admin";
import {
  Attachment,
  AttachmentID,
  getIDForAttachment,
  getIDForPrompt,
  Prompt,
  PromptID,
} from "metabook-core";
import {
  getReferenceForAttachmentID,
  getReferenceForPromptID,
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
