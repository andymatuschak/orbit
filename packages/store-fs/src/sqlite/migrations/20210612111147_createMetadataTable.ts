import { SQLMigration } from "./migrationType.js";

const migration: SQLMigration = {
  version: 20210612111147,
  statements: [`CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT)`],
};
export default migration;
