import yargs from "yargs";
import { disableSource } from "./commands/disableSource";
import { fastForwardUser } from "./commands/fastForwardUser";
import { processUserNotification } from "./commands/processUserNotification";
import { resetUser } from "./commands/resetUser";

yargs(process.argv.slice(2))
  .command(disableSource)
  .command(fastForwardUser)
  .command(processUserNotification)
  .command(resetUser)
  .demandCommand().argv;
