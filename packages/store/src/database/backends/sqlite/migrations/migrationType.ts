export interface SQLMigration {
  version: number;
  statements: string[];
}
