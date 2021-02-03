import { getAdminApp } from "./adminApp";
import { getPromptIDForFirebaseKey } from "metabook-firebase-support";
import fs from "fs";

(async () => {
  const app = getAdminApp();
  const db = app.firestore();
  const dataSnapshot = await db.collection("data").get();
  const lines = dataSnapshot.docs.map((snapshot) => {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      id: getPromptIDForFirebaseKey(snapshot.id),
      dataJSON: JSON.stringify(snapshot.data()),
    });
  });

  await fs.promises.writeFile("dataRecords.json", lines.join("\n"), "utf8");
})().then(() => process.exit(0));
