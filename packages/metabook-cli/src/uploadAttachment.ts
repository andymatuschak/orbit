import { Command, flags } from "@oclif/command";
import "firebase/firestore";
import fs from "fs";

import { MetabookFirebaseDataClient } from "metabook-client";
import {
  getAttachmentMimeTypeForFilename,
  getIDForAttachment,
  imageAttachmentType,
} from "metabook-core";
import { getFirebaseKeyForCIDString } from "metabook-firebase-support/dist/cdidEncoding";
import path from "path";
import { uploadAttachment } from "./adminApp";
import { getClientApp } from "./clientApp";

class UploadAttachment extends Command {
  static flags = {
    help: flags.help(),
  };

  static args = [{ name: "path", required: true }];

  async run() {
    const { args } = this.parse(UploadAttachment);

    const app = getClientApp();
    const dataClient = new MetabookFirebaseDataClient(
      app.firestore(),
      app.functions(),
      uploadAttachment,
    );

    const attachmentMimeType = getAttachmentMimeTypeForFilename(
      path.basename(args.path),
    );
    if (!attachmentMimeType) {
      console.error("Attachment is of unsupported type.");
      return;
    }

    const fileData = await fs.promises.readFile(
      path.resolve(__dirname, args.path),
    );

    const attachmentID = await getIDForAttachment(fileData);
    await dataClient.recordAttachments([
      {
        attachment: {
          contents: fileData,
          mimeType: attachmentMimeType,
          type: imageAttachmentType,
        },
        id: attachmentID,
      },
    ]);

    console.log(attachmentID, getFirebaseKeyForCIDString(attachmentID));
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(UploadAttachment.run() as Promise<unknown>).catch(
  require("@oclif/errors/handle"),
);
