import yargs from "yargs";

import resetUser from "./commands/resetUser";

yargs(process.argv.slice(2)).command(resetUser).demandCommand().argv;
