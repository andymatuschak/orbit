import { ActionLog, getIDForActionLog } from "metabook-core";
import batchWriteEntries from "./batchWriteEntries";
import {
  Database,
  DocumentReference,
  FieldValue,
  ServerTimestamp,
} from "./libraryAbstraction";
import { getReferenceForActionLogID } from "./references";

export type ActionLogDocument<T extends ServerTimestamp> = ActionLog & {
  serverTimestamp: T;
  suppressTaskStateCacheUpdate?: boolean;
};

export async function storeLogs<D extends Database, T extends ServerTimestamp>(
  logs: ActionLog[],
  userID: string,
  database: D,
  serverTimestampFieldValue: FieldValue,
  timestampConstructor: (ms: number, ns: number) => T,
  suppressTaskStateCacheUpdate = false,
): Promise<[DocumentReference<D>, ActionLogDocument<T>][]> {
  const refs = await Promise.all(
    logs.map(async (log) => {
      const logDocument: ActionLogDocument<T> = {
        ...log,
        // The force-cast is necessary because we often use a sentinel value ("update this server-side on write")
        serverTimestamp: (serverTimestampFieldValue as unknown) as T,
        ...(suppressTaskStateCacheUpdate && {
          suppressTaskStateCacheUpdate: true,
        }),
      };

      const ref = getReferenceForActionLogID(
        database,
        userID,
        await getIDForActionLog(log),
      ) as firebase.firestore.DocumentReference<
        ActionLogDocument<ServerTimestamp>
      >;

      return [ref, logDocument] as [DocumentReference<D>, ActionLogDocument<T>];
    }),
  );
  await batchWriteEntries(refs, database, timestampConstructor);

  return refs;
}
