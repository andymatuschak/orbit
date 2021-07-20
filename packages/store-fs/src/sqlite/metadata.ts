import { SQLMetadataTableKey, SQLTableName } from "./tables";
import { execReadTransaction } from "./transactionUtils";
import {
  SQLDatabase,
  SQLStatementCallback,
  SQLStatementErrorCallback,
  SQLTransaction,
} from "./types";

export async function getMetadataKeys<Key extends SQLMetadataTableKey>(
  db: SQLDatabase,
  keys: Key[],
): Promise<Partial<Record<Key, string>>> {
  const results: Partial<Record<Key, string>> = {};
  await execReadTransaction(db, (tx) => {
    for (const key of keys) {
      tx.executeSql(
        `SELECT value FROM ${SQLTableName.Metadata} WHERE key=?`,
        [key],
        (transaction, resultSet) => {
          if (resultSet.rows.length > 0) {
            results[key] = resultSet.rows.item(0)["value"];
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

export function setMetadataKeys<Key extends SQLMetadataTableKey>(
  tx: SQLTransaction,
  keys: Record<Key, string>,
  successCallback?: SQLStatementCallback,
  errorCallback?: SQLStatementErrorCallback,
): void {
  const entries = Object.entries(keys);
  const placeholderString = entries.map(() => `(?,?)`).join(",");

  tx.executeSql(
    `REPLACE INTO ${SQLTableName.Metadata} (key, value) VALUES ${placeholderString}`,
    entries.flat(),
    successCallback,
    errorCallback,
  );
}
