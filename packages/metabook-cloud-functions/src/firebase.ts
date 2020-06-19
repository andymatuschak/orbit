import * as firebase from "firebase-admin";
import { decode } from "firebase-functions/lib/providers/https";
import {
  ActionLogID,
  Attachment,
  AttachmentID,
  getIDForAttachment,
  getIDForPrompt,
  Prompt,
  PromptID,
} from "metabook-core";
import {
  ActionLogDocument,
  DataRecord,
  DataRecordID,
  getActionLogIDForFirebaseKey,
  getLogCollectionReference,
  getReferenceForDataRecordID,
  getTaskStateCacheReferenceForTaskID,
  PromptStateCache,
  storageAttachmentsPathComponent,
  storageBucketName,
} from "metabook-firebase-support";
import { getAttachmentIDForFirebaseKey } from "metabook-firebase-support/dist/cdidEncoding";
import applyPromptActionLogToPromptStateCache from "./applyPromptActionLogToPromptStateCache";

let _app: firebase.app.App | null = null;
function getApp(): firebase.app.App {
  if (!_app) {
    _app = firebase.initializeApp();
  }
  return _app;
}

let _database: firebase.firestore.Firestore | null = null;
function getDatabase(): firebase.firestore.Firestore {
  if (!_database) {
    _database = getApp().firestore();
  }
  return _database;
}

let _auth: firebase.auth.Auth | null = null;
function getAuth(): firebase.auth.Auth {
  if (!_auth) {
    _auth = getApp().auth();
  }
  return _auth;
}

export function recordPrompts(prompts: Prompt[]): Promise<PromptID[]> {
  // TODO probably add something about provenance
  // TODO something about user quotas, billing
  return Promise.all(
    prompts.map(async (promptData) => {
      const promptID = getIDForPrompt(promptData);
      const dataRef = getReferenceForDataRecordID(getDatabase(), promptID);
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

export async function getDataRecords<R extends DataRecord>(
  recordIDs: DataRecordID<R>[],
): Promise<(R | null)[]> {
  const db = getDatabase();
  const snapshots = (await getDatabase().getAll(
    ...recordIDs.map((recordID) => getReferenceForDataRecordID(db, recordID)),
  )) as firebase.firestore.DocumentSnapshot<R>[];
  return snapshots.map((snapshot) => snapshot.data() ?? null);
}

export async function updatePromptStateCacheWithLog(
  actionLogDocument: ActionLogDocument<firebase.firestore.Timestamp>,
  userID: string,
) {
  const db = getDatabase();
  const promptStateCacheReference = getTaskStateCacheReferenceForTaskID(
    db,
    userID,
    actionLogDocument.taskID,
  );
  return db.runTransaction(async (transaction) => {
    const promptStateCacheSnapshot = await transaction.get(
      promptStateCacheReference,
    );

    const basePromptStateCache =
      (promptStateCacheSnapshot.data() as PromptStateCache) ?? null;

    const newPromptStateCache = await applyPromptActionLogToPromptStateCache({
      actionLogDocument,
      basePromptStateCache,
      fetchAllActionLogDocumentsForTask: async () => {
        const logSnapshot = await getLogCollectionReference(db, userID)
          .where("taskID", "==", actionLogDocument.taskID)
          .get();
        return logSnapshot.docs.map((doc) => {
          const actionLogDocument = doc.data() as ActionLogDocument<
            firebase.firestore.Timestamp
          >;
          return {
            id: getActionLogIDForFirebaseKey(doc.id),
            log: actionLogDocument,
          };
        });
      },
    });

    if (newPromptStateCache instanceof Error) {
      throw new Error(
        `Error applying log to prompt state: ${newPromptStateCache}.\nLog: ${JSON.stringify(
          actionLogDocument,
          null,
          "\t",
        )}\nBase prompt state: ${JSON.stringify(
          basePromptStateCache,
          null,
          "\t",
        )}`,
      );
    } else {
      transaction.set(promptStateCacheReference, newPromptStateCache);
    }
  });
}

export async function getAuthTokensForIDToken(
  idToken: string,
): Promise<{
  sessionCookie: string;
  sessionCookieExpirationDate: Date;
  customLoginToken: string;
}> {
  const auth = getAuth();
  // TODO: At some point, once we add features which would involve revoking user tokens, we'd want to check here to see if the user's token's been revoked.
  const decodedToken = await auth.verifyIdToken(idToken); // will reject on error

  const expiresIn = 1000 * 60 * 60 * 24 * 14; // 2 weeks
  const sessionCookieExpirationDate = new Date(Date.now() + expiresIn);

  const [sessionCookie, customLoginToken] = await Promise.all([
    auth.createSessionCookie(idToken, { expiresIn }),
    auth.createCustomToken(decodedToken.uid),
  ]);
  return { sessionCookie, customLoginToken, sessionCookieExpirationDate };
}

export async function getCustomLoginTokenForSessionCookie(
  sessionCookie: string,
): Promise<string> {
  const auth = getAuth();
  const decodedToken = await auth.verifySessionCookie(sessionCookie); // will reject on error
  return auth.createCustomToken(decodedToken.uid);
}

export async function validateAttachmentWithObjectName(
  objectName: string,
): Promise<unknown> {
  const claimedAttachmentID = getAttachmentIDForFirebaseKey(
    objectName.slice(storageAttachmentsPathComponent.length + 1),
  );
  console.log(`Checking attachment at ${objectName}: ${claimedAttachmentID}`);

  const bucket = getApp().storage().bucket(storageBucketName);
  const file = bucket.file(objectName);
  const readStream = file.createReadStream();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readStream.on("error", reject);
    readStream.on("end", async () => {
      const buffer = Buffer.concat(chunks);
      const computedAttachmentID = await getIDForAttachment(buffer);
      if (computedAttachmentID === claimedAttachmentID) {
        console.log("Attachment matches claimed ID");
      } else {
        console.error(
          `Deleting attachment with non-matching ID ${computedAttachmentID}`,
        );
        await file.delete();
      }
      resolve();
    });
    readStream.on("data", (chunk: Buffer) => chunks.push(chunk));
  });
}
