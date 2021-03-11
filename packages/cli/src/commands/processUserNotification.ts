import pubsub from "@google-cloud/pubsub";
import { CommandModule } from "yargs";

const pubsubInstance = new pubsub.PubSub({
  apiEndpoint: "http://localhost:8085",
});

export const processUserNotification: CommandModule<
  unknown,
  { userID: string; dryRun: boolean }
> = {
  command: "processUserNotification <userID> [options]",
  describe: "updates due dates for user so that a session will be due now",
  builder: (yargs) =>
    yargs
      .options({ dryRun: { type: "boolean", default: false } })
      .positional("userID", {
        describe: "userID to process",
        type: "string",
        demandOption: true,
      }),
  handler: async (argv) => {
    await pubsubInstance.topic("processUserNotification").publishJSON({
      userID: argv.userID,
      isDryRun: argv.dryRun,
    });
    console.log("Done");
  },
};
