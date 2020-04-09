import { Command, flags } from "@oclif/command";
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

    const logRef = db
      .collection("users")
      .doc(userID)
      .collection("logs") as admin.firestore.CollectionReference<
      MetabookActionLog
    >;
    await deleteCollection(db, logRef);
    console.log("User reset");
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(ResetUser.run() as Promise<unknown>).catch(require("@oclif/errors/handle"));
