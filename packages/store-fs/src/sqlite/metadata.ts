import { SQLMetadataTableKey, SQLTableName } from "./tables.js";
import { SQLDatabaseBinding, SQLTransaction } from "./types.js";

export async function getMetadataValues<
  Key extends SQLMetadataTableKey | string,
>(db: SQLDatabaseBinding, keys: Key[]): Promise<Map<Key, string>> {
  const results: Map<Key, string> = new Map();
  const resultSet = await db.executeSql(
    `SELECT key,value from ${SQLTableName.Metadata} WHERE key IN (${keys
      .map(() => "?")
      .join(",")})`,
    keys,
  );
  for (const row of resultSet.rows) {
    if (row.value) {
      results.set(row.key, row.value);
    }
  }
  return results;
}

export function setMetadataValues<Key extends SQLMetadataTableKey | string>(
  tx: SQLTransaction,
  keys: Map<Key, string | null>,
): void {
  const entries = [...keys.entries()];
  const placeholderString = entries.map(() => `(?,?)`).join(",");

  tx.executeSql(
    `REPLACE INTO ${SQLTableName.Metadata} (key, value) VALUES ${placeholderString}`,
    entries.flat(),
  );
}
