import { Database, runDatabaseTests } from "@withorbit/store-shared";
import { SQLDatabaseBackend } from "./sqlite";

describe("database tests", () => {
  runDatabaseTests("SQLite", async (eventReducer) => {
    return new Database(
      new SQLDatabaseBackend(SQLDatabaseBackend.inMemoryDBSubpath),
      eventReducer,
    );
  });
});
