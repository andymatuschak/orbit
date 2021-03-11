import { getAdminApp } from "./adminApp";

(async () => {
  const app = getAdminApp();
  const db = app.firestore();
  const usersSnapshot = await db.collection("users").get();

  const batch = db.batch();
  for (const userDoc of usersSnapshot.docs) {
    const tasks = await userDoc.ref.collection("taskStates").get();
    batch.update(userDoc.ref, {
      activeTaskCount: tasks.docs.filter(
        (doc) => !doc.data().taskMetadata.isDeleted,
      ).length,
    });
  }
  await batch.commit();
})().then(() => console.log("Done."));
