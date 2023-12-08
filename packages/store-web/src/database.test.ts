// @ts-ignore Looks like there is no @types for this library
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import { Database, runDatabaseTests } from "@withorbit/store-shared";
import { IDBDatabaseBackend } from "./indexedDB.js";

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
