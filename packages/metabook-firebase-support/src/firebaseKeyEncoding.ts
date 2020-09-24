import { ActionLogID, AttachmentID, PromptID } from "metabook-core";
import { create } from "multiformats";
import base58 from "multiformats/bases/base58";
import raw from "multiformats/codecs/raw";
import sha2 from "multiformats/hashes/sha2";
import dagJSON from "@ipld/dag-json";

const { multihash, multibase, multicodec, CID } = create();
multihash.add(sha2);
multibase.add(base58);
multicodec.add(dagJSON);

const firebaseKeyBaseEncoding = "base58btc";

// If these ever change, we'll have to use a different Firebase collection to differentiate the different hash references.
const assumedHashFunction = "sha2-256";
const assumedMulticodecCode = multicodec.get("dag-json").code;

// TODO: we should be working in terms of CID objects, not encoded strings. PromptID et al should be instances of CID. Until then, this is the base encoding of the strings we'll output. Bad things will happen if this doesn't match the bases used in metabook-core.
const outputCIDStringBase = "base58btc";

// Firebase keys need to be distributed uniformly by lexicographic sort, but the multiformats have consistent prefixes. So we strip those prefixes off and use the straight hash, encoded as base58btc (but not as a multibase string--i.e. with a prefix) as our Firebase key.
export function getFirebaseKeyForCIDString(CIDString: string): string {
  const decodedCID = CID.from(CIDString);
  const decodedMultihash = multihash.decode(decodedCID.multihash);
  if (decodedMultihash.name !== assumedHashFunction) {
    throw new Error(`Unexpected CID hash function ${decodedMultihash.name}`);
  }
  const hashBuffer = decodedMultihash.digest;
  const multibaseString = multibase.encode(hashBuffer, "base58btc");
  return multibaseString.slice(1);
}

function getMultihashFromFirebaseKey(firebaseKey: string): Uint8Array {
  // The Firebase key is a b58-encoded hash which is assumed to be sha2-256.
  const base58Prefix = multibase.get(firebaseKeyBaseEncoding).prefix;
  const hashBuffer = multibase.decode(base58Prefix + firebaseKey);
  return multihash.encode(hashBuffer, assumedHashFunction);
}

export function getPromptIDForFirebaseKey(firebaseKey: string): PromptID {
  const multihash = getMultihashFromFirebaseKey(firebaseKey);
  const cid = CID.create(1, assumedMulticodecCode, multihash);
  return cid.toString(outputCIDStringBase) as PromptID;
}

export function getActionLogIDForFirebaseKey(firebaseKey: string): ActionLogID {
  const multihash = getMultihashFromFirebaseKey(firebaseKey);
  const cid = CID.create(1, assumedMulticodecCode, multihash);
  return cid.toString(outputCIDStringBase) as ActionLogID;
}

export function getAttachmentIDForFirebaseKey(
  firebaseKey: string,
): AttachmentID {
  const multihash = getMultihashFromFirebaseKey(firebaseKey);
  const cid = CID.create(1, raw.code, multihash);
  return cid.toString(outputCIDStringBase) as AttachmentID;
}

const encoder = new TextEncoder();
export async function getFirebaseKeyForTaskID(taskID: string): Promise<string> {
  // The taskID is not sharding-friendly (since it starts with a CID); we hash it to get a Firebase key with a uniformly-distributed prefix.
  const taskIDBuffer = encoder.encode(taskID);
  const hashBuffer = await multihash.get("sha2-256").encode(taskIDBuffer);
  const multibaseString = multibase.encode(hashBuffer, outputCIDStringBase);
  return multibaseString.slice(1); // Drop the multibase prefix.
}
