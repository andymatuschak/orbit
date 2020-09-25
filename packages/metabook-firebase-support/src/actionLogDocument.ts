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
  serverTimestamp: ServerTimestamp;
  suppressTaskStateCacheUpdate?: boolean;
};

export async function storeLogs<D extends Database>(
  logs: ActionLog[],
  userID: string,
  database: D,
  serverTimestampFieldValue: FieldValue,
  timestampConstructor: (ms: number, ns: number) => ServerTimestamp,
  suppressTaskStateCacheUpdate: boolean = false,
): Promise<[DocumentReference<D>, ActionLogDocument<ServerTimestamp>][]> {
  const refs = await Promise.all(
    logs.map(async (log) => {
      const logDocument: ActionLogDocument<ServerTimestamp> = {
        ...log,
        serverTimestamp: (serverTimestampFieldValue as unknown) as ServerTimestamp,
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

      return [ref, logDocument] as [
        DocumentReference<D>,
        ActionLogDocument<ServerTimestamp>,
      ];
    }),
  );
  await batchWriteEntries(refs, database, timestampConstructor);

  return refs;
}
