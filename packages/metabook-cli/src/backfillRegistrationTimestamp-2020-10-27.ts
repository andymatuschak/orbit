import { getAdminApp } from "./adminApp";

(async () => {
  const app = getAdminApp();
  const db = app.firestore();
  const usersSnapshot = await db.collection("users").get();
  const batch = db.batch();
  for (const userDoc of usersSnapshot.docs) {
    batch.set(userDoc.ref, {
      registrationTimestampMillis: userDoc
        .data()
        .registrationTimestamp.toMillis(),
    });
  }
  await batch.commit();
})().then(() => console.log("Done."));
