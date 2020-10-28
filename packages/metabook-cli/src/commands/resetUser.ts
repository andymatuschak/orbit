import {
  getLogCollectionReference,
  getTaskStateCacheCollectionReference,
  getUserMetadataReference,
} from "metabook-firebase-support";
import { CommandModule } from "yargs";
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

    const userMetadataRef = getUserMetadataReference(db, userID);
    const userMetadata = (await userMetadataRef.get()).data();
    if (userMetadata) {
      await userMetadataRef.set({
        registrationTimestampMillis: userMetadata.registrationTimestampMillis,
      });
    }
    console.log("User reset");
  },
};

export default command;
