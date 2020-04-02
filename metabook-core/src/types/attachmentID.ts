import { Buffer } from "buffer";
import CID from "cids";
import multihashing from "multihashing";

export type AttachmentID = string & { __attachmentIDOpaqueType: never };

export function getIDForAttachment(attachmentBuffer: Buffer) {
  const hash = multihashing(attachmentBuffer, "sha2-256");
  const cid = new CID(1, "identity", hash, "base58btc");

  return cid.toString() as AttachmentID;
}
