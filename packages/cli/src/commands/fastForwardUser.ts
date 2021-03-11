import admin from "firebase-admin";
import { RescheduleActionLog, rescheduleActionLogType } from "@withorbit/core";
import {
  getTaskStateCacheCollectionReference,
  storeLogs,
} from "metabook-firebase-support";
import { CommandModule } from "yargs";
import { getAdminApp } from "../adminApp";

export const fastForwardUser: CommandModule<unknown, { userID: string }> = {
  command: "fastForwardUser <userID>",
  describe: "updates due dates for user so that a session will be due now",
  builder: (yargs) =>
    yargs.positional("userID", {
      describe: "userID to fast forward",
      type: "string",
      demandOption: true,
    }),
  handler: async (argv) => {
    const app = getAdminApp();

    const db = app.firestore();
    const userID = argv.userID;

    const taskStates = getTaskStateCacheCollectionReference(db, userID);
    const firstSet = await taskStates
      .orderBy("dueTimestampMillis")
      .limit(25)
      .get();
    const now = Date.now();
    const logs = firstSet.docs.map(
      (doc): RescheduleActionLog => ({
        actionLogType: rescheduleActionLogType,
        newTimestampMillis: now,
        taskID: doc.data().taskID,
        timestampMillis: now,
        parentActionLogIDs: doc.data().headActionLogIDs,
      }),
    );
    await storeLogs(logs, userID, db, () =>
      admin.firestore.FieldValue.serverTimestamp(),
    );
    console.log("Done");
  },
};
