import { Command, flags } from "@oclif/command";
import "firebase/firestore";
import fs from "fs";

import {
  getDefaultFirebaseApp,
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "@withorbit/api-client";
import {
  applicationPromptType,
  Attachment,
  AttachmentIDReference,
  AttachmentMimeType,
  clozePromptType,
  getActionLogFromPromptActionLog,
  getIDForAttachment,
  getIDForPrompt,
  getIDForPromptTask,
  imageAttachmentType,
  Prompt,
  PromptActionLog,
  PromptParameters,
  PromptTask,
  PromptTaskID,
  PromptTaskParameters,
  qaPromptType,
} from "@withorbit/core";
import {
  testApplicationPrompt,
  testQAPrompt,
  testClozePrompt,
} from "@withorbit/sample-data";
import path from "path";
import { uploadAttachment } from "./adminApp";

async function getTasksFromPrompts(prompts: Prompt[]): Promise<PromptTaskID[]> {
  const taskLists: PromptTaskID[][] = await Promise.all(
    prompts.map(async (spec) => {
      let promptParameters: PromptParameters;
      switch (spec.promptType) {
        case qaPromptType:
        case applicationPromptType:
          promptParameters = null;
          break;
        case clozePromptType:
          // TODO: import all cloze indices
          promptParameters = { clozeIndex: 0 };
          break;
      }
      return [
        getIDForPromptTask({
          promptID: await getIDForPrompt(spec),
          promptType: spec.promptType,
          promptParameters: promptParameters,
        } as PromptTask),
      ];
    }),
  );

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

    const app = getDefaultFirebaseApp();
    const dataClient = new MetabookFirebaseDataClient(
      app.functions(),
      uploadAttachment,
    );

    const imageData = await fs.promises.readFile(
      path.resolve(__dirname, "__fixtures__/general_circuit.png"),
    );
    const imageAttachment: Attachment = {
      type: imageAttachmentType,
      mimeType: AttachmentMimeType.PNG,
      contents: imageData,
    };
    const imageAttachmentIDReference: AttachmentIDReference = {
      type: imageAttachmentType,
      id: await getIDForAttachment(imageData),
      byteLength: imageData.byteLength,
    };

    const testImagePrompt: Prompt = {
      ...testQAPrompt,
      question: {
        ...testQAPrompt.question,
        attachments: [imageAttachmentIDReference],
      },
    };

    const specs = [
      testImagePrompt,
      testQAPrompt,
      testApplicationPrompt,
      testClozePrompt,
    ];

    await dataClient.recordPrompts(specs);
    console.log(`Recorded ${specs.length} spec(s)`);

    await dataClient.recordAttachments([{ attachment: imageAttachment }]);
    console.log(`Recorded 1 attachment`);

    const userClient = new MetabookFirebaseUserClient(
      app.firestore(),
      flags.userID,
    );
    const tasks = await getTasksFromPrompts(specs);
    const now = Date.now();
    const actionLogs: PromptActionLog<PromptTaskParameters>[] = tasks.map(
      (taskID) => ({
        actionLogType: "ingest",
        timestampMillis: now,
        taskID,
        provenance: null,
      }),
    );
    await userClient.recordActionLogs(
      actionLogs.map(getActionLogFromPromptActionLog),
    );
    console.log(
      `Recorded ${actionLogs.length} logs for userID ${flags.userID}`,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(Ingest.run() as Promise<unknown>).catch(require("@oclif/errors/handle"));
