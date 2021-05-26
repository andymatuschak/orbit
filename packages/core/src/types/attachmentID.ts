import { encodeRawBufferToCIDString } from "../util/cids";

/**
 * @TJS-type string
 */
export type AttachmentID = string & { __attachmentIDOpaqueType: never };

export async function getIDForAttachment(
  attachmentData: Uint8Array,
): Promise<AttachmentID> {
  return (await encodeRawBufferToCIDString(attachmentData)) as AttachmentID;
}
