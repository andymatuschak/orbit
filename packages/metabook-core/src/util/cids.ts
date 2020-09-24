import { create, CID as CIDType } from "multiformats";
import base58 from "multiformats/bases/base58";
import base32 from "multiformats/bases/base32";
import sha2 from "multiformats/hashes/sha2";
import raw from "multiformats/codecs/raw";
import dagJSON from "@ipld/dag-json";
import { AttachmentID } from "../types/attachmentID";
import { ActionLogID } from "../actionLogID";
import { PromptID } from "../promptID";
import { ActionLog } from "../types/actionLog";
import { Prompt } from "../types/prompt";

const { multihash, multibase, multicodec, CID } = create();
multihash.add(sha2);
multibase.add(base32);
multibase.add(base58);
multicodec.add(dagJSON);

const standardCIDHashName = "sha2-256";
const standardCIDBaseName = "base58btc";

type EncodableWhitelist = Prompt | ActionLog;
export async function encodeObjectToCIDString<T extends EncodableWhitelist>(
  object: CIDEncodable<T>,
): Promise<string> {
  // 1. Encode the object as DAG-JSON.
  const encodedBuffer = multicodec.encode(object, "dag-json");

  // 2. Hash the buffer and encode the hash as a CID
  const hash = await multihash.hash(encodedBuffer, standardCIDHashName);
  const cid = CID.create(1, multicodec.get("dag-json").code, hash);

  // 3. Express the CID as a base58 string.
  return cid.toString(standardCIDBaseName) as PromptID;
}

export async function encodeRawBufferToCIDString(
  buffer: Uint8Array,
): Promise<string> {
  const hash = await multihash.hash(buffer, standardCIDHashName);
  const cid = CID.create(1, raw.code, hash);
  return cid.toString(standardCIDBaseName) as PromptID;
}

export { CID, multibase, multihash, multicodec };

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type CIDEncodable<T> = T extends PromptID | ActionLogID | AttachmentID
  ? CIDType
  : T extends object
  ? { [K in keyof T]: CIDEncodable<T[K]> }
  : T extends (infer P)[]
  ? CIDEncodable<P>[]
  : T;
