import * as functions from "firebase-functions";
import { storageAttachmentsPathComponent } from "metabook-firebase-support";
import { validateAndPrepareAttachmentWithObjectName } from "../firebase";

const onAttachmentUpload = functions.storage
  .object()
  .onFinalize(async (object) => {
    if (!object.name?.startsWith(storageAttachmentsPathComponent)) {
      console.log("Ignoring attachment with name", object.name);
      return;
    }

    await validateAndPrepareAttachmentWithObjectName(
      object.name,
      object.contentType,
    );
  });

export default onAttachmentUpload;
