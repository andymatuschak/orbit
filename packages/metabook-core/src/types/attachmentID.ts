import { encodeRawBufferToCIDString } from "../util/cids";

export type AttachmentID = string & { __attachmentIDOpaqueType: never };

export async function getIDForAttachment(
  attachmentData: Uint8Array,
): Promise<AttachmentID> {
  return (await encodeRawBufferToCIDString(attachmentData)) as AttachmentID;
}
