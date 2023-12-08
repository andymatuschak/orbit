import OrbitAPIClient, { emulatorAPIConfig } from "@withorbit/api-client";
import { UserMetadata } from "../../../db/userMetadata.js";
import { createTestAdminFirebaseApp } from "../../firebaseTesting.js";

export async function setupAuthToken(
  name: string,
  userMetadata: Partial<UserMetadata> = {},
) {
  const firebase = createTestAdminFirebaseApp();
  const firestore = firebase.firestore();
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
