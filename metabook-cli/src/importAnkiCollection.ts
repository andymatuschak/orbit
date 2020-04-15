import { Command, flags } from "@oclif/command";
import "firebase/firestore";
import {
  createImportPlan,
  readAnkiCollectionPackage,
} from "../../metabook-anki";
import fs from "fs";

class ImportAnkiCollection extends Command {
  static flags = {
    help: flags.help(),
    userID: flags.string({
      required: true,
    }),
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

    await fs.promises.writeFile("importAnki.log", plan.issues.join("\n"));
    await fs.promises.writeFile(
      "prompts.log",
      JSON.stringify(plan.prompts, null, "\t"),
    );
    await fs.promises.writeFile(
      "logs.log",
      JSON.stringify(plan.logs, null, "\t"),
    );

    const csv: string[] = ["Old,New"];
    for (const log of plan.logs) {
      const anyLog = log as any;
      if ("debug" in anyLog) {
        csv.push(
          `${anyLog.debug.originalInterval},${anyLog.debug.newInterval}`,
        );
      }
    }
    await fs.promises.writeFile("comparison.csv", csv.join("\n"));
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(ImportAnkiCollection.run() as Promise<unknown>).catch(
  require("@oclif/errors/handle"),
);
