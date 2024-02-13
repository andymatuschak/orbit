import { getMetadataValues, setMetadataValues } from "./metadata.js";
import { latestSchemaVersionNumber, migrations } from "./migrations/index.js";
import { SQLMetadataTableKey, SQLTableName } from "./tables.js";
import { SQLDatabaseBinding } from "./types.js";

export async function performMigration(
  db: SQLDatabaseBinding,
  logProgress?: boolean,
  throughSchemaVersionNumber?: number,
): Promise<void> {
  const currentVersion = await getSchemaVersionNumber(db);

  const debugLog = (str: string) => {
    if (logProgress) {
      console.log(str);
    }
  };

  await db.transaction((tx) => {
    const targetVersionNumber =
      throughSchemaVersionNumber ?? latestSchemaVersionNumber;
    if (currentVersion < targetVersionNumber) {
      debugLog(
        `Starting migration from ${currentVersion} to ${targetVersionNumber}`,
      );
      let lastVersionNumber = currentVersion;
      for (const migration of migrations.filter(
        (m) => m.version > currentVersion && m.version <= targetVersionNumber,
      )) {
        debugLog(`Migrating to ${migration.version}`);
        for (const statement of migration.statements) {
          tx.executeSql(statement);
        }
        lastVersionNumber = migration.version;
      }
      if (lastVersionNumber != targetVersionNumber) {
        throw new Error(
          `Attempting migration to ${targetVersionNumber} but only reached ${lastVersionNumber}`,
        );
      }
      setMetadataValues(
        tx,
        new Map([
          [SQLMetadataTableKey.Version, targetVersionNumber.toString()],
        ]),
      );
    } else if (currentVersion > targetVersionNumber) {
      throw new Error(
        `Attempting migration from ${currentVersion} to earlier version ${targetVersionNumber}`,
      );
    }
  });
}

export async function getSchemaVersionNumber(
  db: SQLDatabaseBinding,
): Promise<number> {
  // First we check to see if the configuration table exists at all.
  const tableCheckResults = await db.executeSql(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${SQLTableName.Metadata}';`,
  );

  // If it does, we read the version number out of it.
  if (tableCheckResults.rows.length > 0) {
    const dbVersionString = (
      await getMetadataValues(db, [SQLMetadataTableKey.Version])
    ).get(SQLMetadataTableKey.Version);
    const dbVersion = Number.parseInt(dbVersionString ?? "");
    if (Number.isNaN(dbVersion)) {
      throw new Error("Can't read database version");
    }
    return dbVersion;
  } else {
    // Meta table doesn't exist: must be a new database.
    return 0;
  }
}
