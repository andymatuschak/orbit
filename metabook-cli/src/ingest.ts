import { Command, flags } from "@oclif/command";
import firebase from "firebase/app";
import "firebase/firestore";

import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import type { MetabookActionLog } from "metabook-client/src/types/actionLog";
import { getIDForPromptSpec, PromptSpec, PromptTask } from "metabook-core";
import {
  testApplicationPromptSpec,
  testBasicPromptSpec,
  testClozePromptGroupSpec,
} from "metabook-sample-data";

function getTasksFromSpecs(specs: PromptSpec[]): PromptTask[] {
  const taskLists: PromptTask[][] = specs.map((spec) => {
    switch (spec.promptSpecType) {
      case "basic":
        return [
          {
            prompt: {
              promptSpecID: getIDForPromptSpec(spec),
              promptParameters: null,
            },
            parameters: null,
          },
        ];
      case "applicationPrompt":
        return [
          {
            prompt: {
              promptSpecID: getIDForPromptSpec(spec),
              promptParameters: null,
            },
            parameters: { variantIndex: 0 },
          },
        ];
      case "cloze":
        return [
          {
            prompt: {
              promptSpecID: getIDForPromptSpec(spec),
              promptParameters: { clozeIndex: 0 },
            },
            parameters: null,
          },
        ];
    }
  });

  return taskLists.reduce((output, list) => output.concat(list), []);
}

class Ingest extends Command {
  static flags = {
    help: flags.help(),
    userID: flags.string({
      required: true,
    }),
  };

  async run() {
    const { flags } = this.parse(Ingest);

    const app = firebase.initializeApp({
      apiKey: "AIzaSyAwlVFBlx4D3s3eSrwOvUyqOKr_DXFmj0c",
      authDomain: "metabook-system.firebaseapp.com",
      databaseURL: "https://metabook-system.firebaseio.com",
      projectId: "metabook-system",
      storageBucket: "metabook-system.appspot.com",
      messagingSenderId: "748053153064",
      appId: "1:748053153064:web:efc2dfbc9ac11d8512bc1d",
    });

    const dataClient = new MetabookFirebaseDataClient(app);

    const specs = [
      testBasicPromptSpec,
      testApplicationPromptSpec,
      testClozePromptGroupSpec,
    ];

    await dataClient.recordData(specs);
    console.log(`Recorded ${specs.length} spec(s)`);

    const userClient = new MetabookFirebaseUserClient(app, flags.userID);
    const tasks = getTasksFromSpecs(specs);
    const now = firebase.firestore.Timestamp.fromDate(new Date());
    const actionLogs: MetabookActionLog[] = tasks.map((promptTask) => {
      return {
        promptTask,
        actionOutcome: "remembered",
        timestamp: now,
        sessionID: null,
        baseIntervalMillis: null,
        nextNeedsRetry: false,
        nextBestIntervalMillis: null,
        nextIntervalMillis: 0,
        nextDueTimestamp: now,
      };
    });
    await userClient.recordActionLogs(actionLogs);
    console.log(
      `Recorded ${actionLogs.length} logs for userID ${flags.userID}`,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(Ingest.run() as Promise<unknown>).catch(require("@oclif/errors/handle"));
