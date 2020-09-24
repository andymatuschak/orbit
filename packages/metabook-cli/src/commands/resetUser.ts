import yargs, { CommandModule } from "yargs";
import {
  getLogCollectionReference,
  getTaskStateCacheCollectionReference,
} from "metabook-firebase-support";
import { getAdminApp } from "../adminApp";
import { deleteCollection } from "../deleteCollection";

const command: CommandModule<{}, { userID: string }> = {
  command: "resetUser <userID>",
  describe: "delete all user data associated with a user",
  builder: (yargs) =>
    yargs.positional("userID", {
      describe: "userID to reset",
      type: "string",
      demandOption: true,
    }),
  handler: async (argv) => {
    const app = getAdminApp();

    const db = app.firestore();
    const userID = argv.userID;

    await deleteCollection(db, getLogCollectionReference(db, userID));
    await deleteCollection(
      db,
      getTaskStateCacheCollectionReference(db, userID),
    );
    console.log("User reset");
  },
};

export default command;
