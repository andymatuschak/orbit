import { SQLMigration } from "./migrationType.js";

const migration: SQLMigration = {
  version: 20211019170802,
  statements: [
    `
    CREATE TABLE attachments (
      id TEXT PRIMARY KEY,
      data BLOB NOT NULL,
      mimeType TEXT NOT NULL
    )
    `,
  ],
};
export default migration;
