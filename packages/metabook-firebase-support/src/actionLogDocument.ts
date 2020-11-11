import { ActionLog, getIDForActionLog } from "metabook-core";
import batchWriteEntries from "./batchWriteEntries";
import {
  Database,
  DocumentReference,
  FieldValue,
  ServerTimestamp,
  TimestampOf,
} from "./libraryAbstraction";
import { getActionLogIDReference } from "./references";

export type ActionLogDocument<
  T extends ServerTimestamp = ServerTimestamp
> = ActionLog & {
  serverTimestamp: T;
  suppressTaskStateCacheUpdate?: boolean;
};

export async function storeLogs<D extends Database>(
  logs: ActionLog[],
  userID: string,
  database: D,
  serverTimestampFieldValue: FieldValue,
  suppressTaskStateCacheUpdate = false,
): Promise<
  [
    DocumentReference<D, ActionLogDocument<TimestampOf<D>>>,
    ActionLogDocument<TimestampOf<D>>,
  ][]
> {
  const refs = await Promise.all(
    logs.map(async (log) => {
      const logDocument: ActionLogDocument<TimestampOf<D>> = {
        ...log,
        // The force-cast is necessary because we often use a sentinel value ("update this server-side on write")
        serverTimestamp: (serverTimestampFieldValue as unknown) as TimestampOf<
          D
        >,
        ...(suppressTaskStateCacheUpdate && {
          suppressTaskStateCacheUpdate: true,
        }),
      };

      const ref = getActionLogIDReference(
        database,
        userID,
        await getIDForActionLog(log),
      ) as DocumentReference<D, ActionLogDocument<ServerTimestamp>>;

      return [ref, logDocument] as [
        DocumentReference<D, ActionLogDocument<TimestampOf<D>>>,
        ActionLogDocument<TimestampOf<D>>,
      ];
    }),
  );
  await batchWriteEntries(refs, database);

  return refs;
}
