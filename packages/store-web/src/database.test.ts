import { runDatabaseTests } from "@withorbit/store-shared/dist/databaseTests.test";
import { OrbitStoreWeb } from "./orbitStoreWeb";
// @ts-ignore Looks like there is no @types for this library
import FDBFactory from "fake-indexeddb/lib/FDBFactory";

describe("database tests", () => {
  runDatabaseTests(
    "IndexedDB",
    (eventReducer) =>
      new OrbitStoreWeb({
        indexedDB: new FDBFactory(),
        eventReducer,
      }).database,
  );
});
