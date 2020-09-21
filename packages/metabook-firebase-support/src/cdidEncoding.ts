import "buffer";
import CID from "cids";
import { ActionLogID, AttachmentID, PromptID } from "metabook-core";
import multihashes from "multihashes";

export function getFirebaseKeyForCIDString(CIDString: string): string {
  const decodedCID = new CID(CIDString);
  return multihashes.toB58String(
    multihashes.decode(decodedCID.multihash).digest,
  );
}

export function getPromptIDForFirebaseKey(firebaseKey: string): PromptID {
  const multihash = multihashes.encode(
    multihashes.fromB58String(firebaseKey),
    "sha2-256",
  );
  return new CID(1, "dag-pb", multihash, "base58btc").toString() as PromptID;
}

export function getActionLogIDForFirebaseKey(firebaseKey: string): ActionLogID {
  const multihash = multihashes.encode(
    multihashes.fromB58String(firebaseKey),
    "sha2-256",
  );
  return new CID(1, "dag-pb", multihash, "base58btc").toString() as ActionLogID;
}

export function getAttachmentIDForFirebaseKey(
  firebaseKey: string,
): AttachmentID {
  const multihash = multihashes.encode(
    multihashes.fromB58String(firebaseKey),
    "sha2-256",
  );
  return new CID(1, "raw", multihash, "base58btc").toString() as AttachmentID;
}
