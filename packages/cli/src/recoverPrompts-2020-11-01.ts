import fs from "fs";
import { batchWriteEntries } from "@withorbit/firebase-support";
import { getAdminApp } from "./adminApp";

(async () => {
  // 2. Prompts.
  const app = getAdminApp();
  const db = app.firestore();

  const promptEntries = JSON.parse(
    await fs.promises.readFile("promptEntries.json", { encoding: "utf-8" }),
  );
  const writes = promptEntries.map((promptEntry: any) => {
    const path = promptEntry[0]._path.segments.join("/");
    const ref = db.doc(path);
    if (promptEntry[1].explanation === null) {
      delete promptEntry[1].explanation;
    }
    return [ref, promptEntry[1]];
  });

  await batchWriteEntries(writes, db);
  console.log("Done");
})().then(() => process.exit(0));
