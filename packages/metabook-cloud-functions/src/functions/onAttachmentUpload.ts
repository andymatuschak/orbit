import * as functions from "firebase-functions";
import { storageAttachmentsPathComponent } from "metabook-firebase-support";
import { validateAndFinalizeAttachmentWithObjectName } from "../firebase/attachments";

const onAttachmentUpload = functions.storage
  .object()
  .onFinalize(async (object) => {
    if (!object.name?.startsWith(storageAttachmentsPathComponent)) {
      console.log("Ignoring attachment with name", object.name);
      return;
    }

    await validateAndFinalizeAttachmentWithObjectName(
      object.name,
      object.contentType ?? null,
    );
  });

export default onAttachmentUpload;
