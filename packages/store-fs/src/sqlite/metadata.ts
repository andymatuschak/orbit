import { SQLMetadataTableKey, SQLTableName } from "./tables";
import { execReadTransaction } from "./transactionUtils";
import {
  SQLDatabase,
  SQLStatementCallback,
  SQLStatementErrorCallback,
  SQLTransaction,
} from "./types";

export async function getMetadataValues<
  Key extends SQLMetadataTableKey | string,
>(db: SQLDatabase, keys: Key[]): Promise<Map<Key, string>> {
  const results: Map<Key, string> = new Map();
  await execReadTransaction(db, (tx) => {
    for (const key of keys) {
      tx.executeSql(
        `SELECT value FROM ${SQLTableName.Metadata} WHERE key=?`,
        [key],
        (transaction, resultSet) => {
          if (resultSet.rows.length > 0) {
            const value = resultSet.rows.item(0)["value"];
            if (value !== null) {
              results.set(key, value);
            }
          }
        },
        (transaction, error) => {
          throw error;
        },
      );
    }
  });
  return results;
}

export function setMetadataValues<Key extends SQLMetadataTableKey | string>(
  tx: SQLTransaction,
  keys: Map<Key, string | null>,
  successCallback?: SQLStatementCallback,
  errorCallback?: SQLStatementErrorCallback,
): void {
  const entries = [...keys.entries()];
  const placeholderString = entries.map(() => `(?,?)`).join(",");

  tx.executeSql(
    `REPLACE INTO ${SQLTableName.Metadata} (key, value) VALUES ${placeholderString}`,
    entries.flat(),
    successCallback,
    errorCallback,
  );
}
