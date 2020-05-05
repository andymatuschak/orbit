import { Buffer } from "buffer";
import CID from "cids";
import multihashes from "multihashes";
import { sha256 } from "sha.js";

export type AttachmentID = string & { __attachmentIDOpaqueType: never };

export function getIDForAttachment(attachmentBuffer: Buffer) {
  const hash = new sha256().update(attachmentBuffer).digest();
  const multihash = multihashes.encode(hash, "sha2-256");
  const cid = new CID(1, "identity", multihash, "base58btc");

  return cid.toString() as AttachmentID;
}
