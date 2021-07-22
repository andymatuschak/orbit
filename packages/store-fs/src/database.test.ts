import { runDatabaseTests } from "@withorbit/store-shared/dist/databaseTests.test";
import { OrbitStoreInMemory } from "./inMemory/orbitStoreInMemory";

describe("database tests", () => {
  runDatabaseTests("SQLite", (eventReducer) => {
    return new OrbitStoreInMemory(eventReducer).database;
  });
});
