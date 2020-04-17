import { Command, flags } from "@oclif/command";
import firebase from "firebase";
import "firebase/firestore";
import admin from "firebase-admin";
import fs from "fs";
import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import {
  batchWriteEntries,
  getTaskStateCacheReferenceForTaskID,
} from "metabook-firebase-shared";
import path from "path";
import {
  createImportPlan,
  readAnkiCollectionPackage,
} from "../../metabook-anki";
import { getAdminApp } from "./adminApp";

class ImportAnkiCollection extends Command {
  static flags = {
    help: flags.help(),
    userID: flags.string({
      required: true,
    }),
    skipUpload: flags.boolean(),
  };

  static args = [{ name: "ankiCollectionPath", required: true }];

  async run() {
    const { flags, args } = this.parse(ImportAnkiCollection);

    const plan = await readAnkiCollectionPackage(
      args.ankiCollectionPath,
      createImportPlan,
    );

    console.log(`${plan.prompts.length} prompts imported`);
    console.log(`${plan.logs.length} logs imported`);
    console.log(`${plan.attachments.length} attachments imported`);
    console.log(`${plan.issues.length} issues found`);

    if (flags.skipUpload) {
      await fs.promises.writeFile(
        path.resolve(__dirname, "importPlan.json"),
        JSON.stringify(plan),
        {
          encoding: "utf8",
        },
      );
    } else {
      console.log("\nUploading to server...");

      const adminApp = getAdminApp();
      const adminDB = adminApp.firestore();
      /*batchWriteEntries(
        plan.promptStateCaches.map(({ taskID, promptState }) => [
          getTaskStateCacheReferenceForTaskID(adminDB, flags.userID, taskID),
          {
            taskID,
            ...promptState,
            lastUpdateTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          },
        ]),
        adminDB,
        (ms, ns) => new firebase.firestore.Timestamp(ms, ns),
      );*/

      const app = firebase.initializeApp({
        apiKey: "AIzaSyAwlVFBlx4D3s3eSrwOvUyqOKr_DXFmj0c",
        authDomain: "metabook-system.firebaseapp.com",
        databaseURL: "https://metabook-system.firebaseio.com",
        projectId: "metabook-system",
        storageBucket: "metabook-system.appspot.com",
        messagingSenderId: "748053153064",
        appId: "1:748053153064:web:efc2dfbc9ac11d8512bc1d",
      });
      const dataClient = new MetabookFirebaseDataClient(
        app,
        app.functions(),
        () => {
          throw new Error("unimplemented");
        },
      );

      // await dataClient.recordAttachments(plan.attachments);
      // console.log("Recorded attachments.");

      // await dataClient.recordPrompts(plan.prompts);
      console.log("Recorded prompts.");

      const userClient = new MetabookFirebaseUserClient(app, flags.userID);
      await userClient.recordActionLogs(plan.logs);
      console.log("Recorded logs.");

      console.log("Done.");
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(ImportAnkiCollection.run() as Promise<unknown>).catch(
  require("@oclif/errors/handle"),
);
