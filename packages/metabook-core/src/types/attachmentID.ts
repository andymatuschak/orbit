import CID from "cids";
import multihashes from "multihashes";
import sha256 from "../util/sha256";

export type AttachmentID = string & { __attachmentIDOpaqueType: never };

export async function getIDForAttachment(attachmentData: Uint8Array) {
  const hash = await sha256(attachmentData);
  const multihash = multihashes.encode(hash, "sha2-256");
  const cid = new CID(1, "identity", multihash, "base58btc");

  return cid.toString() as AttachmentID;
}
