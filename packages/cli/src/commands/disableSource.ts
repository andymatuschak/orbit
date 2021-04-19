import {
  ActionLog,
  ActionLogID,
  getActionLogFromPromptActionLog,
  getIDForActionLogSync,
  PromptTaskID,
  PromptUpdateMetadataActionLog,
  updateMetadataActionLogType,
} from "@withorbit/core";
import {
  batchWriteEntries,
  getActionLogIDReference,
  getTaskStateCacheCollectionReference,
} from "@withorbit/firebase-support";
import { CommandModule } from "yargs";
import { getAdminApp } from "../adminApp";

import admin from "firebase-admin";

export const disableSource: CommandModule<{}, { userID: string }> = {
  command: "disableSource <userID> <URL>",
  describe: "disables all prompts added from a particular URL",
  builder: (yargs) =>
    yargs
      .positional("userID", {
        describe: "userID to modify",
        type: "string",
        demandOption: true,
      })
      .positional("URL", {
        describe: "URL to search for",
        type: "string",
        demandOption: true,
      }),
  handler: async (argv) => {
    const app = getAdminApp();

    const db = app.firestore();
    const userID = argv.userID;

    const logs = getTaskStateCacheCollectionReference(db, userID);
    const matchingLogSnapshot = await logs
      .where("taskMetadata.provenance.url", ">=", argv.URL)
      .where("taskMetadata.provenance.url", "<", `${argv.URL}~`)
      .get();
    console.log(`Found ${matchingLogSnapshot.size} matching tasks`);

    const taskIDs = new Map<PromptTaskID, ActionLogID[]>();
    for (const doc of matchingLogSnapshot.docs) {
      const promptTaskID = doc.data().taskID;
      taskIDs.set(promptTaskID, doc.data().headActionLogIDs);
    }

    const entries: [any, ActionLog][] = [];
    for (const [taskID, parentActionLogIDs] of taskIDs) {
      const log: PromptUpdateMetadataActionLog = {
        taskID,
        parentActionLogIDs,
        actionLogType: updateMetadataActionLogType,
        timestampMillis: Date.now(),
        updates: { isDeleted: true },
        // @ts-ignore
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      };
      const logID = getIDForActionLogSync(log);
      entries.push([
        getActionLogIDReference(db, userID, logID),
        getActionLogFromPromptActionLog(log),
      ]);
    }

    await batchWriteEntries(entries, db);
    console.log("Done");
  },
};
