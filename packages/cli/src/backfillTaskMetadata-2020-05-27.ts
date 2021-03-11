import { Command, flags } from "@oclif/command";
import {
  batchWriteEntries,
  getLogCollectionReference,
  getTaskStateCacheCollectionReference,
} from "@withorbit/firebase-support";
import admin from "firebase-admin";
import { getAdminApp } from "./adminApp";
import { deleteCollection } from "./deleteCollection";

class ResetUser extends Command {
  static flags = {
    help: flags.help(),
    userID: flags.string({
      required: true,
    }),
  };

  async run() {
    const { flags } = this.parse(ResetUser);

    const app = getAdminApp();

    const db = app.firestore();
    const userID = flags.userID;

    const promptStateSnapshot = await getTaskStateCacheCollectionReference(
      db,
      userID,
    ).get();
    await batchWriteEntries(
      promptStateSnapshot.docs.map((doc) => [
        doc.ref,
        {
          ...doc.data(),
          taskMetadata: { isDeleted: false },
        },
      ]),
      db,
      (s, ns) => new admin.firestore.Timestamp(s, ns),
    );
    console.log("Done.");
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(ResetUser.run() as Promise<unknown>).catch(require("@oclif/errors/handle"));
