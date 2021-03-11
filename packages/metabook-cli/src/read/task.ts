import { Command, flags } from "@oclif/command";
import { MetabookFirebaseDataClient } from "@withorbit/api-client";
import { getPromptTaskForID } from "@withorbit/core";
import {
  compareServerTimestamps,
  getActionLogIDForFirebaseKey,
  getLogCollectionReference,
  getReferenceForDataRecordID,
  getTaskStateCacheReferenceForTaskID,
} from "metabook-firebase-support";
import { getAdminApp } from "../adminApp";

class ReadTask extends Command {
  static flags = {
    help: flags.help(),
    userID: flags.string({
      required: true,
    }),
  };

  static args = [{ name: "taskID", required: true }];

  async run() {
    const { flags, args } = this.parse(ReadTask);
    const promptTask = getPromptTaskForID(args.taskID);
    if (promptTask instanceof Error) {
      throw new Error(`Invalid taskID: ${promptTask.message}`);
    }

    const app = getAdminApp();
    const taskStateReference = await getTaskStateCacheReferenceForTaskID(
      app.firestore(),
      flags.userID,
      args.taskID,
    );
    const taskStateCacheSnapshot = await taskStateReference.get();

    console.log("\nCurrent task state:");
    console.log(taskStateCacheSnapshot.data());

    const prompt = await getReferenceForDataRecordID(
      app.firestore(),
      promptTask.promptID,
    ).get();
    console.log("\nPrompt data:");
    console.log(prompt.data());

    const logs = await getLogCollectionReference(app.firestore(), flags.userID)
      .where("taskID", "==", args.taskID)
      .get();
    console.log("Logs (newest first):");
    const docs = logs.docs.sort((a, b) =>
      compareServerTimestamps(
        b.data().serverTimestamp,
        a.data().serverTimestamp,
      ),
    );
    for (const doc of docs) {
      console.log(getActionLogIDForFirebaseKey(doc.id));
      console.log(doc.data());
      console.log("\n");
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(ReadTask.run() as Promise<unknown>).catch(require("@oclif/errors/handle"));
