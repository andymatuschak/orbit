import { getMetadataValues, setMetadataValues } from "./metadata";
import { latestSchemaVersionNumber, migrations } from "./migrations";
import { SQLMetadataTableKey, SQLTableName } from "./tables";
import { execReadStatement, execTransaction } from "./transactionUtils";
import { SQLDatabase } from "./types";

export async function performMigration(
  db: SQLDatabase,
  throughSchemaVersionNumber?: number,
): Promise<void> {
  const currentVersion = await getSchemaVersionNumber(db);

  await execTransaction(db, (tx) => {
    const targetVersionNumber =
      throughSchemaVersionNumber ?? latestSchemaVersionNumber;
    if (currentVersion < targetVersionNumber) {
      console.log(
        `Starting migration from ${currentVersion} to ${targetVersionNumber}`,
      );
      let lastVersionNumber = currentVersion;
      for (
        let migrationIndex = 0;
        migrationIndex < migrations.length &&
        migrations[migrationIndex].version <= targetVersionNumber;
        migrationIndex++
      ) {
        const migration = migrations[migrationIndex];
        console.log(`Migrating to ${migration.version}`);
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

export async function getSchemaVersionNumber(db: SQLDatabase): Promise<number> {
  // First we check to see if the configuration table exists at all.
  const tableCheckResults = await execReadStatement(
    db,
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
