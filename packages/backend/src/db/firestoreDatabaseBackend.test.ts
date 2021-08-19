import { eventReducer, TaskIngestEvent } from "@withorbit/core";
import { createTestTaskIngestEvents } from "@withorbit/sample-data";
import { Database, runDatabaseTests } from "@withorbit/store-shared";
import firebase from "firebase-admin";
import {
  createTestAdminFirebaseApp,
  terminateTestFirebaseApp,
} from "../__tests__/firebaseTesting";
import { FirestoreDatabaseBackend } from "./firestoreDatabaseBackend";

class TestFirestoreDatabaseBackend extends FirestoreDatabaseBackend {
  private _app: firebase.app.App;
  constructor(app: firebase.app.App) {
    super("testUser", app.firestore());
    this._app = app;
  }

  async close() {
    await super.close();
    await terminateTestFirebaseApp(this._app);
  }
}

describe("database tests", () => {
  runDatabaseTests(
    "Firestore",
    async (eventReducer) => {
      const currentFirebaseApp = createTestAdminFirebaseApp();
      const backend = new TestFirestoreDatabaseBackend(currentFirebaseApp);
      return new Database(backend, eventReducer);
    },
    false,
  );
});

test("duplicate events aren't returned from putEvents", async () => {
  const currentFirebaseApp = createTestAdminFirebaseApp();
  const backend = new TestFirestoreDatabaseBackend(currentFirebaseApp);
  const db = new Database(backend, eventReducer);

  const testEvents: TaskIngestEvent[] = createTestTaskIngestEvents(5);
  const firstResult = await db.putEvents(testEvents);
  expect(firstResult.length).toBe(5);
  const secondResult = await db.putEvents(testEvents);
  expect(secondResult.length).toBe(0);

  await db.close();
});
