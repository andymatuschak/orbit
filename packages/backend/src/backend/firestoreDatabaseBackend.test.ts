import { Database, runDatabaseTests } from "@withorbit/store-shared";
import { FirestoreDatabaseBackend } from "./firestoreDatabaseBackend";
import {
  createTestAdminFirebaseApp,
  resetTestFirebaseApp,
} from "./firebaseSupport/__tests__/firebaseTesting";
import firebase from "firebase-admin";

describe("database tests", () => {
  let currentFirebaseApp: firebase.app.App | null = null;
  runDatabaseTests("SQLite", async (eventReducer) => {
    if (currentFirebaseApp) {
      await resetTestFirebaseApp(currentFirebaseApp);
    }

    currentFirebaseApp = createTestAdminFirebaseApp();
    const backend = new FirestoreDatabaseBackend(
      "testUser",
      currentFirebaseApp.firestore(),
    );
    return new Database(backend, eventReducer);
  });
});
