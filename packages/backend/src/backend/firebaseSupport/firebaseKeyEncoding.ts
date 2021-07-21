import { ActionLogID, AttachmentID, PromptID } from "@withorbit/core";
import { base58btc } from "multiformats/bases/base58";
import CID from "multiformats/cid";
import raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";
import * as digest from "multiformats/hashes/digest";
import * as dagJSON from "@ipld/dag-json";
import * as crypto from "crypto";

const firebaseKeyBaseEncoding = base58btc;

// If these ever change, we'll have to use a different Firebase collection to differentiate the different hash references.
const assumedHasher = sha256;
const assumedMulticodec = dagJSON;

// TODO: we should be working in terms of CID objects, not encoded strings. PromptID et al should be instances of CID. Until then, this is the base encoding of the strings we'll output. Bad things will happen if this doesn't match the bases used in @withorbit/core.
const outputCIDStringBaseEncoding = base58btc;

// Firebase keys need to be distributed uniformly by lexicographic sort, but the multiformats have consistent prefixes. So we strip those prefixes off and use the straight hash, encoded as base58btc (but not as a multibase string--i.e. with a prefix) as our Firebase key.
export function getFirebaseKeyForCIDString(CIDString: string): string {
  const decodedCID = CID.parse(CIDString);
  if (decodedCID.multihash.code !== assumedHasher.code) {
    throw new Error(
      `Unexpected CID hash function ${decodedCID.multihash.code}`,
    );
  }
  return firebaseKeyBaseEncoding.baseEncode(decodedCID.multihash.digest);
}

function getMultihashFromFirebaseKey(
  firebaseKey: string,
): digest.MultihashDigest {
  // The Firebase key is a b58-encoded hash which is assumed to be sha2-256.
  const hashBuffer = firebaseKeyBaseEncoding.baseDecode(firebaseKey);
  return digest.create(assumedHasher.code, hashBuffer);
}

export function getPromptIDForFirebaseKey(firebaseKey: string): PromptID {
  const multihash = getMultihashFromFirebaseKey(firebaseKey);
  const cid = CID.create(1, assumedMulticodec.code, multihash);
  return cid.toString(outputCIDStringBaseEncoding) as PromptID;
}

export function getActionLogIDForFirebaseKey(firebaseKey: string): ActionLogID {
  const multihash = getMultihashFromFirebaseKey(firebaseKey);
  const cid = CID.create(1, assumedMulticodec.code, multihash);
  return cid.toString(outputCIDStringBaseEncoding) as ActionLogID;
}

export function getAttachmentIDForFirebaseKey(
  firebaseKey: string,
): AttachmentID {
  const multihash = getMultihashFromFirebaseKey(firebaseKey);
  const cid = CID.create(1, raw.code, multihash);
  return cid.toString(outputCIDStringBaseEncoding) as AttachmentID;
}

// Firebase keys are supposed to be sharding-friendly--i.e. distributed uniformly by lexicographic sort. This function lets us use an arbitrary identifier which might have a common prefix or not be uniformly distributed (e.g. a taskID) as a Firebase key by hashing it.
export function getFirebaseKeyFromStringHash(input: string): string {
  const hashObject = crypto.createHash("sha256");
  hashObject.update(input);
  const hashDigestBuffer = hashObject.digest();
  return outputCIDStringBaseEncoding.baseEncode(hashDigestBuffer);
}
