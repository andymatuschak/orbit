import { Command } from "@oclif/command";
import { Attachment, getIDForAttachment } from "@withorbit/core";
import { getAdminApp, uploadAttachment } from "./adminApp";

class BackfillAttachments extends Command {
  async run() {
    const app = getAdminApp();
    const db = app.firestore();

    const attachmentRecords = await db
      .collection("data")
      .where("type", "==", "image")
      .get();
    let attachmentCounter = 0;
    for (const attachmentSnapshot of attachmentRecords.docs) {
      /*const attachmentData = attachmentSnapshot.data() as Attachment;
      const attachment: Attachment = {
        ...attachmentData,
        contents: Buffer.from(
          (attachmentData.contents as unknown) as string,
          "binary",
        ),
      };
      await uploadAttachment(
        attachment,
        await getIDForAttachment(attachment.contents),
      );*/

      await attachmentSnapshot.ref.delete();

      attachmentCounter++;
      console.log(`${attachmentCounter} / ${attachmentRecords.size}`);
    }
    console.log("Done.");
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(BackfillAttachments.run() as Promise<unknown>).catch(
  require("@oclif/errors/handle"),
);
