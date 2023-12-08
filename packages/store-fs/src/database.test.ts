import { Database, runDatabaseTests } from "@withorbit/store-shared";
import { SQLDatabaseBackend } from "./sqlite.js";

describe("database tests", () => {
  runDatabaseTests("SQLite", async (eventReducer, eventValidator) => {
    return new Database(
      new SQLDatabaseBackend(SQLDatabaseBackend.inMemoryDBSubpath),
      eventReducer,
      eventValidator,
    );
  });
});
