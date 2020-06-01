import { Command, flags } from "@oclif/command";
import { ActionLogID } from "metabook-core";
import { getReferenceForActionLogID } from "metabook-firebase-support";
import { getAdminApp } from "../adminApp";

class ReadLog extends Command {
  static flags = {
    help: flags.help(),
    userID: flags.string({
      required: true,
    }),
  };

  static args = [{ name: "logID", required: true }];

  async run() {
    const { flags, args } = this.parse(ReadLog);
    const app = getAdminApp();
    const snapshot = await getReferenceForActionLogID(
      app.firestore(),
      flags.userID,
      args.logID as ActionLogID,
    ).get();
    console.log(snapshot.data());
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(ReadLog.run() as Promise<unknown>).catch(require("@oclif/errors/handle"));
