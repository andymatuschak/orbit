import * as firebase from "firebase-admin";
import { ActionLog, getIDForPrompt, Prompt, PromptID } from "metabook-core";
import {
  ActionLogDocument,
  DataRecord,
  DataRecordID,
  getActionLogIDForFirebaseKey,
  getLogCollectionReference,
  getReferenceForDataRecordID,
  getTaskStateCacheReferenceForTaskID,
  PromptStateCache,
  storeLogs as _storeLogs,
} from "metabook-firebase-support";
import applyPromptActionLogToPromptStateCache from "../applyPromptActionLogToPromptStateCache";

let _app: firebase.app.App | null = null;
export function getApp(): firebase.app.App {
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

export function recordPrompts(prompts: Prompt[]): Promise<PromptID[]> {
  // TODO probably add something about provenance https://github.com/andymatuschak/metabook/issues/59
  // TODO something about user quotas, billing
  return Promise.all(
    prompts.map(async (promptData) => {
      const promptID = await getIDForPrompt(promptData);
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

export async function storeLogs(logs: ActionLog[], userID: string) {
  // These logs will all end up with the same server timestamp, which create a lot of flailing in onLogCreate, since execution order is not guaranteed. We'll go ahead and compute the new prompt states right here.
  const storedLogs = await _storeLogs(
    logs,
    userID,
    getDatabase(),
    firebase.firestore.Timestamp.now(),
    (ms: number, ns: number) => new firebase.firestore.Timestamp(ms, ns),
    true,
  );

  // Apply each log sequentially, with a separate transaction for each. This is a bit wasteful.
  for (const [, log] of storedLogs) {
    await updatePromptStateCacheWithLog(log, userID);
  }
}

export async function storePromptsIfNecessary(
  promptsByID: {
    [key: string]: Prompt;
  },
  getStoredPrompts: (
    promptIDs: PromptID[],
  ) => Promise<(Prompt | null)[]> = getDataRecords,
  storePrompts: (prompts: Prompt[]) => Promise<PromptID[]> = recordPrompts,
) {
  const entries = Object.entries(promptsByID) as [PromptID, Prompt][];
  const existingPromptRecords = await getStoredPrompts(
    entries.map(([promptID]) => promptID),
  );
  const missingEntries = entries
    .map((entry, index) => (existingPromptRecords[index] ? null : entry))
    .filter((entry): entry is [PromptID, Prompt] => !!entry);

  if (missingEntries.length > 0) {
    console.log(
      "Storing missing prompts with IDs",
      missingEntries.map(([id]) => id),
    );
    const storedPromptIDs = await storePrompts(
      missingEntries.map(([, prompt]) => prompt),
    );
    const mismatchedPromptIDs = storedPromptIDs.filter(
      (promptID, index) => promptID !== missingEntries[index][0],
    );
    if (mismatchedPromptIDs.length > 0) {
      throw new Error(
        `Prompts don't match their IDs (server/client version mismatch?): ${mismatchedPromptIDs.join(
          ", ",
        )}`,
      );
    }
  }
}

export async function updatePromptStateCacheWithLog(
  actionLogDocument: ActionLogDocument<firebase.firestore.Timestamp>,
  userID: string,
) {
  const db = getDatabase();
  const promptStateCacheReference = await getTaskStateCacheReferenceForTaskID(
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
        const logQuery = await getLogCollectionReference(db, userID).where(
          "taskID",
          "==",
          actionLogDocument.taskID,
        );
        const logSnapshot = await transaction.get(logQuery);
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
