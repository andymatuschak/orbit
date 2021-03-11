import admin from "firebase-admin";
import * as fs from "fs";
import {
  batchWriteEntries,
  getLogCollectionReference,
  getTaskStateCacheCollectionReference,
} from "@withorbit/firebase-support";
import { getAdminApp } from "./adminApp";
import { deleteCollection } from "./deleteCollection";

const userID = "x5EWk2UT56URxbfrl7djoxwxiqH2";

(async () => {
  const app = getAdminApp();
  const db = app.firestore();

  const logCollection = getLogCollectionReference(db, userID);
  const logs = JSON.parse(
    await fs.promises.readFile("logEntries.json", { encoding: "utf-8" }),
  );

  const updatedLogEntries = logs.map(([ref, data]: any[]) => {
    const path = ref._path.segments.join("/");
    const st = data.serverTimestamp;
    return [
      db.doc(path),
      {
        ...data,
        serverTimestamp: new admin.firestore.Timestamp(
          st._seconds,
          st._nanoseconds,
        ),
      },
    ] as const;
  });

  console.log("Deleting user logs");
  await deleteCollection(db, logCollection);
  console.log("Deleting user states");
  await deleteCollection(db, getTaskStateCacheCollectionReference(db, userID));

  console.log("Writing updated logs");
  await batchWriteEntries(updatedLogEntries, db, (s, ns) => {
    return new admin.firestore.Timestamp(s, ns);
  });
  console.log("Done");
})().then(() => process.exit(0));
