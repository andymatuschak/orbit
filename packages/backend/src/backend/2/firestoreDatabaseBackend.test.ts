import { Database, runDatabaseTests } from "@withorbit/store-shared";
import {
  createTestAdminFirebaseApp,
  terminateTestFirebaseApp,
} from "../../__tests__/firebaseTesting";
import { FirestoreDatabaseBackend } from "./firestoreDatabaseBackend";
import firebase from "firebase-admin";

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
