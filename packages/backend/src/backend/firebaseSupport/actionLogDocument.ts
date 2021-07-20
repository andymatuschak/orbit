import { ActionLog, getIDForActionLog } from "@withorbit/core";
import firebase, { firestore as AdminFirestore } from "firebase-admin";
import batchWriteEntries from "./batchWriteEntries";
import { getActionLogIDReference } from "./references";

export type ActionLogDocument = ActionLog & {
  serverTimestamp: firebase.firestore.Timestamp;
  suppressTaskStateCacheUpdate?: boolean;
};

export function getActionLogFromActionLogDocument(
  document: ActionLogDocument,
): ActionLog {
  const {
    serverTimestamp, // eslint-disable-line @typescript-eslint/no-unused-vars
    suppressTaskStateCacheUpdate, // eslint-disable-line @typescript-eslint/no-unused-vars
    ...actionLog
  } = document;
  return actionLog;
}

// TODO: integrate into backend/actionLogs: this doesn't belong here.
export async function storeLogs<D extends AdminFirestore.Firestore>(
  logs: ActionLog[],
  userID: string,
  database: D,
  getServerTimestampFieldValue: () => AdminFirestore.FieldValue,
  suppressTaskStateCacheUpdate = false,
): Promise<
  [AdminFirestore.DocumentReference<ActionLogDocument>, ActionLogDocument][]
> {
  const refs = await Promise.all(
    logs.map(async (log) => {
      const logDocument: ActionLogDocument = {
        ...log,
        // The force-cast is necessary because we often use a sentinel value ("update this server-side on write")
        serverTimestamp:
          getServerTimestampFieldValue() as unknown as AdminFirestore.Timestamp,
        ...(suppressTaskStateCacheUpdate && {
          suppressTaskStateCacheUpdate: true,
        }),
      };

      const ref = getActionLogIDReference(
        database,
        userID,
        await getIDForActionLog(log),
      ) as AdminFirestore.DocumentReference<ActionLogDocument>;

      return [ref, logDocument] as [
        AdminFirestore.DocumentReference<ActionLogDocument>,
        ActionLogDocument,
      ];
    }),
  );
  await batchWriteEntries(refs, database);

  return refs;
}
