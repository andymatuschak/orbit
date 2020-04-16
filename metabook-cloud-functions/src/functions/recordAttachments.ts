import * as functions from "firebase-functions";
import { Attachment, AttachmentID } from "metabook-core";
import { recordAttachments } from "../firebase";

interface RecordAttachmentsArguments {
  attachments: Attachment[];
}

interface RecordPromptsResult {
  attachmentIDs: AttachmentID[];
}

export default functions.https.onCall(
  async (data: RecordAttachmentsArguments): Promise<RecordPromptsResult> => {
    // TODO require auth
    const attachmentIDs = await recordAttachments(data.attachments);
    console.log("Recorded attachment IDs", attachmentIDs);
    return { attachmentIDs };
  },
);
