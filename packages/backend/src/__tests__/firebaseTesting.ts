import OrbitAPIClient, { emulatorAPIConfig } from "@withorbit/api-client";
import { App, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { UserMetadata } from "../db/userMetadata.js";

const projectID = "metabook-system";
const firestoreEmulatorHost = "127.0.0.1:8080";

let app: App | null = null;

export async function terminateTestFirebaseApp() {
  if (app) {
    await deleteApp(app);
    app = null;
  }
}

export async function clearFirestoreData() {
  const result = await fetch(
    `http://${firestoreEmulatorHost}/emulator/v1/projects/${projectID}/databases/(default)/documents`,
    {
      method: "DELETE",
    },
  );
  if (!result.ok) {
    throw new Error(
      `Couldn't clear database data: ${result.status} ${await result.text()}`,
    );
  }
}

export async function setupAuthToken(
  name: string,
  userMetadata: Partial<UserMetadata> = {},
) {
  const app = getTestFirebaseAdminApp();
  const firestore = getFirestore(app);
  await firestore
    .collection("users")
    .doc("WvLvv9uDtFha1jVTyxObVl00gPFN")
    .set({
      registrationTimestampMillis: 1615510817519,
      ...userMetadata,
    });

  await firestore.collection("accessCodes").doc(name).set({
    type: "personalAccessToken",
    userID: "WvLvv9uDtFha1jVTyxObVl00gPFN",
  });
}

export async function setupTestOrbitAPIClient(): Promise<OrbitAPIClient> {
  await setupAuthToken("auth");
  return new OrbitAPIClient(
    async () => ({ personalAccessToken: "auth" }),
    emulatorAPIConfig,
  );
}

export function getTestFirebaseAdminApp(): App {
  if (!app) {
    app = initializeApp({ projectId: projectID });
  }
  return app;
}
