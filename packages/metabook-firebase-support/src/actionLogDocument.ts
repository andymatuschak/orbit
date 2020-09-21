import { ActionLog, getIDForActionLog } from "metabook-core";
import batchWriteEntries from "./batchWriteEntries";
import { Database, FieldValue, ServerTimestamp } from "./libraryAbstraction";
import { getReferenceForActionLogID } from "./references";

export type ActionLogDocument<T extends ServerTimestamp> = ActionLog & {
  serverTimestamp: ServerTimestamp;
  suppressTaskStateCacheUpdate?: boolean;
};

export async function storeLogs(
  logs: ActionLog[],
  userID: string,
  database: Database,
  serverTimestampFieldValue: FieldValue,
  timestampConstructor: (ms: number, ns: number) => ServerTimestamp,
) {
  await batchWriteEntries(
    await Promise.all(
      logs.map(async (log) => {
        const logDocument: ActionLogDocument<ServerTimestamp> = {
          ...log,
          serverTimestamp: (serverTimestampFieldValue as unknown) as ServerTimestamp,
        };
        return [
          getReferenceForActionLogID(
            database,
            userID,
            await getIDForActionLog(log),
          ),
          logDocument,
        ] as const;
      }),
    ),
    database,
    timestampConstructor,
  );
}
