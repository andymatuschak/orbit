import { eventReducer, TaskIngestEvent } from "@withorbit/core";
import { createTestTaskIngestEvents } from "@withorbit/sample-data";
import { Database, runDatabaseTests } from "@withorbit/store-shared";
import type { App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { resetLocalEmulators } from "../__tests__/emulators.js";
import {
  getTestFirebaseAdminApp,
  terminateTestFirebaseApp,
} from "../__tests__/firebaseTesting.js";
import { FirestoreDatabaseBackend } from "./firestoreDatabaseBackend.js";

class TestFirestoreDatabaseBackend extends FirestoreDatabaseBackend {
  constructor(app: App) {
    super("testUser", getFirestore(app));
  }

  async close() {
    await super.close();
    await terminateTestFirebaseApp();
  }
}

describe("database tests", () => {
  runDatabaseTests(
    "Firestore",
    async (eventReducer, eventValidator) => {
      await resetLocalEmulators();
      const currentFirebaseApp = getTestFirebaseAdminApp();
      const backend = new TestFirestoreDatabaseBackend(currentFirebaseApp);
      return new Database(backend, eventReducer, eventValidator);
    },
    false,
  );
});

test("duplicate events aren't returned from putEvents", async () => {
  const currentFirebaseApp = getTestFirebaseAdminApp();
  const backend = new TestFirestoreDatabaseBackend(currentFirebaseApp);
  const db = new Database(backend, eventReducer);

  const testEvents: TaskIngestEvent[] = createTestTaskIngestEvents(5);
  const firstResult = await db.putEvents(testEvents);
  expect(firstResult.length).toBe(5);
  const secondResult = await db.putEvents(testEvents);
  expect(secondResult.length).toBe(0);

  await db.close();
});
