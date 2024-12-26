import { describe } from "bun:test";
import { Database } from "@withorbit/store-shared";
import { runDatabaseTests } from "@withorbit/store-shared/databaseTests";
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
