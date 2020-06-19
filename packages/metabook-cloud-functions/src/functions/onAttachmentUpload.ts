import * as functions from "firebase-functions";
import { storageAttachmentsPathComponent } from "metabook-firebase-support";
import { validateAttachmentWithObjectName } from "../firebase";

const onAttachmentUpload = functions.storage
  .object()
  .onFinalize(async (object) => {
    if (!object.name?.startsWith(storageAttachmentsPathComponent)) {
      console.log("Ignoring attachment with name", object.name);
      return;
    }

    await validateAttachmentWithObjectName(object.name);
  });

export default onAttachmentUpload;
