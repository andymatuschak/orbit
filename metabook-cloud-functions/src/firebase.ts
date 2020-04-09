import * as firebase from "firebase-admin";
import {
  Attachment,
  AttachmentID,
  getIDForAttachment,
  getIDForPrompt,
  Prompt,
  PromptID,
} from "metabook-core";

let _database: firebase.firestore.Firestore | null = null;
function getDatabase(): firebase.firestore.Firestore {
  if (!_database) {
    const app = firebase.initializeApp();
    _database = app.firestore();
  }
  return _database;
}

export function getDataCollectionReference(): firebase.firestore.CollectionReference<
  Prompt | Attachment
> {
  // TODO remove duplication with metabook-client
  return getDatabase().collection(
    "data",
  ) as firebase.firestore.CollectionReference<Prompt>;
}

export function recordPrompts(prompts: Prompt[]): Promise<PromptID[]> {
  // TODO probably add something about provenance
  // TODO something about user quotas, billing
  const collectionReference = getDataCollectionReference();
  return Promise.all(
    prompts.map(async (promptData) => {
      const id = getIDForPrompt(promptData);
      const dataRef = collectionReference.doc(id);
      await dataRef
        .create(promptData)
        .then(() => {
          console.log("Recorded prompt spec", id, promptData);
        })
        .catch(() => {
          return;
        });
      return id as PromptID;
    }),
  );
}

export function recordAttachments(
  attachments: Attachment[],
): Promise<AttachmentID[]> {
  // TODO probably add something about provenance
  // TODO something about user quotas, billing
  const collectionReference = getDataCollectionReference();
  return Promise.all(
    attachments.map(async (attachment) => {
      const id = getIDForAttachment(Buffer.from(attachment.contents, "binary"));
      const dataRef = collectionReference.doc(id);
      await dataRef
        .create(attachment)
        .then(() => {
          console.log("Recorded attachment", id);
        })
        .catch(() => {
          return;
        });
      return id as AttachmentID;
    }),
  );
}
