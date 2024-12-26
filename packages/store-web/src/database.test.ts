// @ts-ignore Looks like there is no @types for this library
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import { Database } from "@withorbit/store-shared";
import { runDatabaseTests } from "@withorbit/store-shared/databaseTests";
import { IDBDatabaseBackend } from "./indexedDB.js";
import { describe } from "bun:test";

describe("database tests", () => {
  runDatabaseTests(
    "IndexedDB",
    async (eventReducer, eventValidator) =>
      new Database(
        new IDBDatabaseBackend("TestDB", new FDBFactory()),
        eventReducer,
        eventValidator,
      ),
  );
});
