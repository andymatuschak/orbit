import OrbitAPIClient, { emulatorAPIConfig } from "@withorbit/api-client";
import { App, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getUserMetadata } from "../db/firebaseAccountData.js";
import { UserMetadata } from "../db/userMetadata.js";

const projectID = "metabook-system";
const firestoreEmulatorHost = "127.0.0.1:8080";
const firebaseAuthEmulatorHost = "127.0.0.1:9099";

process.env["FIRESTORE_EMULATOR_HOST"] = firestoreEmulatorHost;
process.env["FIREBASE_STORAGE_EMULATOR_HOST"] = "127.0.0.1:9199";
process.env["FIREBASE_AUTH_EMULATOR_HOST"] = firebaseAuthEmulatorHost;

let app: App | null = null;

export async function terminateTestFirebaseApp() {
  if (app) {
    await deleteApp(app);
    app = null;
  }
}

export async function clearFirestoreData() {
  let result = await fetch(
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

  result = await fetch(
    `http://${firebaseAuthEmulatorHost}/emulator/v1/projects/${projectID}/accounts`,
    {
      method: "DELETE",
    },
  );
  if (!result.ok) {
    throw new Error(
      `Couldn't clear auth data: ${result.status} ${await result.text()}`,
    );
  }
}

export async function setupAuthToken(
  authToken: string,
  userID = "testUserID",
  userMetadata: Partial<UserMetadata> = {},
) {
  const app = getTestFirebaseAdminApp();
  const firestore = getFirestore(app);
  await firestore
    .collection("users")
    .doc(userID)
    .set({
      registrationTimestampMillis: 1615510817519,
      ...userMetadata,
    });

  await firestore.collection("accessCodes").doc(authToken).set({
    type: "personalAccessToken",
    userID,
  });
}

export async function setupAccessCode(
  accessCode: string,
  userID = "testUserID",
  userMetadata: Partial<UserMetadata> = {},
  expirationDate: Date = new Date(Date.now() + 1000 * 60),
) {
  const app = getTestFirebaseAdminApp();
  const firestore = getFirestore(app);
  await firestore
    .collection("users")
    .doc(userID)
    .set({
      registrationTimestampMillis: 1615510817519,
      ...userMetadata,
    });

  await firestore
    .collection("accessCodes")
    .doc(accessCode)
    .set({
      type: "oneTime",
      userID,
      expirationTimestamp: Timestamp.fromDate(expirationDate),
    });
}

export async function getTestUserMetadata(
  userID: string,
): Promise<UserMetadata | null> {
  const app = getTestFirebaseAdminApp();
  const firestore = getFirestore(app);
  return await getUserMetadata(userID, firestore);
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
