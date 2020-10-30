import "./bufferShim";
import * as dagJSON from "@ipld/dag-json";
import CID from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { base58btc } from "multiformats/bases/base58";
import raw from "multiformats/codecs/raw";
import { ActionLogID } from "../actionLogID";
import { PromptID } from "../promptID";
import { ActionLog } from "../types/actionLog";
import { AttachmentID } from "../types/attachmentID";
import { Prompt } from "../types/prompt";

type EncodableWhitelist = Prompt | ActionLog;
export async function encodeObjectToCIDString<T extends EncodableWhitelist>(
  object: CIDEncodable<T>,
): Promise<string> {
  // 1. Encode the object as DAG-JSON.
  const encodedBuffer = dagJSON.encode(object);

  // 2. Hash the buffer and encode the hash as a CID
  const hash = await sha256.digest(encodedBuffer);
  const cid = CID.create(1, dagJSON.code, hash);

  // 3. Express the CID as a base58 string.
  return cid.toString(base58btc) as PromptID;
}

export async function encodeRawBufferToCIDString(
  buffer: Uint8Array,
): Promise<string> {
  const hash = await sha256.digest(buffer);
  const cid = CID.create(1, raw.code, hash);
  return cid.toString(base58btc) as PromptID;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type CIDEncodable<T> = T extends PromptID | ActionLogID | AttachmentID
  ? CID
  : T extends object
  ? { [K in keyof T]: CIDEncodable<T[K]> }
  : T extends (infer P)[]
  ? CIDEncodable<P>[]
  : T;
