import { createTestAdminFirebaseApp } from "../../firebaseTesting";

export async function setupAuthToken(name: string) {
  const firebase = createTestAdminFirebaseApp();
  const firestore = firebase.firestore();
  await firestore.collection("users").doc("WvLvv9uDtFha1jVTyxObVl00gPFN").set({
    registrationTimestampMillis: 1615510817519,
  });

  firestore.collection("accessCodes").doc(name).set({
    type: "personalAccessToken",
    userID: "WvLvv9uDtFha1jVTyxObVl00gPFN",
  });
}
