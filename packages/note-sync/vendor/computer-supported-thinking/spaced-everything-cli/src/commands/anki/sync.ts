import { Command, flags } from "@oclif/command";
import {
  ankiCache,
  taskCache,
  notePrompts,
  ankiClient
} from "spaced-everything";

export default class Sync extends Command {
  static description = `Syncs the prompts in a set of incremental-thinking compatible notes files to Anki. Adds, updates, and deletes notes as necessary.

You'll first need to have set up AnkiConnect and the note types in Anki--see the Readme.`;

  static examples = [
    `$ spaced-everything anki sync --deck NotePrompts note1.org *.md`
  ];

  static flags = {
    help: flags.help({ char: "h" }),
    // flag with a value (-n, --name=VALUE)
    deck: flags.string({
      char: "d",
      description:
        "the name of a Anki deck to sync notes to (deck must already exist)",
      default: "Default"
    }),
    syncToAnkiWeb: flags.boolean({
      char: "s",
      description: "if set, causes Anki to sync changes to AnkiWeb",
      default: false
    })
  };

  static strict = false;
  static args = [
    {
      name: "FILES...",
      required: true,
      description: "One or more note files to sync prompts from"
    }
  ];

  async run() {
    const { flags, argv } = this.parse(Sync);

    const noteSource = notePrompts.createTaskSource(argv);
    const ankiConnectClient = ankiClient.createDefaultLocalAnkiConnectClient(
      flags.deck
    );
    const anki = ankiCache.createAnkiCache(
      ankiConnectClient,
      flags.syncToAnkiWeb
    );
    try {
      await taskCache.updateTaskCache(anki, noteSource);
      this.log("DONE");
    } catch (error) {
      console.error("ERROR", error);
    }
  }
}
