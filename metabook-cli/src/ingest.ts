import { Command, flags } from "@oclif/command";
import firebase from "firebase/app";
import "firebase/firestore";
import fs from "fs";

import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import {
  Attachment,
  AttachmentIDReference,
  getIDForAttachment,
  getIDForPrompt,
  imageAttachmentType,
  PromptParameters,
  Prompt,
  PromptID,
} from "metabook-core";
import {
  testApplicationPrompt,
  testBasicPrompt,
  testClozePrompt,
} from "metabook-sample-data";
import path from "path";

function getTasksFromSpecs(
  specs: Prompt[],
): {
  promptID: PromptID;
  promptParameters: PromptParameters;
}[] {
  const taskLists: {
    promptID: PromptID;
    promptParameters: PromptParameters;
  }[][] = specs.map((spec) => {
    switch (spec.promptType) {
      case "basic":
        return [
          {
            promptID: getIDForPrompt(spec),
            promptParameters: null,
          },
        ];
      case "applicationPrompt":
        return [
          {
            promptID: getIDForPrompt(spec),
            promptParameters: null,
          },
        ];
      case "cloze":
        return [
          {
            promptID: getIDForPrompt(spec),
            promptParameters: { clozeIndex: 0 },
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
    const dataClient = new MetabookFirebaseDataClient(
      app,
      app.functions(),
      () => {
        throw new Error("unimplemented");
      },
    );

    const imageData = await fs.promises.readFile(
      path.resolve(__dirname, "__fixtures__/general_circuit.png"),
    );
    const imageAttachment: Attachment = {
      type: imageAttachmentType,
      mimeType: "image/png",
      contents: imageData.toString("binary"),
    };
    const imageAttachmentIDReference: AttachmentIDReference = {
      type: imageAttachmentType,
      id: getIDForAttachment(imageData),
      byteLength: imageData.byteLength,
    };

    const testImagePrompt: Prompt = {
      ...testBasicPrompt,
      question: {
        ...testBasicPrompt.question,
        attachments: [imageAttachmentIDReference],
      },
    };

    const specs = [
      testImagePrompt,
      testBasicPrompt,
      testApplicationPrompt,
      testClozePrompt,
    ];

    await dataClient.recordPrompts(specs);
    console.log(`Recorded ${specs.length} spec(s)`);

    await dataClient.recordAttachments([imageAttachment]);
    console.log(`Recorded 1 attachment`);

    const userClient = new MetabookFirebaseUserClient(app, flags.userID);
    const tasks = getTasksFromSpecs(specs);
    const now = firebase.firestore.Timestamp.fromDate(new Date());
    const actionLogs: ActionLog[] = tasks.map(
      ({ promptID, promptParameters }) => {
        return {
          actionLogType: "ingest",
          promptID,
          promptParameters,
          timestamp: now,
        };
      },
    );
    await userClient.recordActionLogs(actionLogs);
    console.log(
      `Recorded ${actionLogs.length} logs for userID ${flags.userID}`,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(Ingest.run() as Promise<unknown>).catch(require("@oclif/errors/handle"));
