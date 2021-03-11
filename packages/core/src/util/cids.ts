import "./bufferShim";
import * as dagJSON from "@ipld/dag-json";
import CID from "multiformats/cid";
import { base58btc } from "multiformats/bases/base58";
import raw from "multiformats/codecs/raw";
import { ActionLogID } from "../actionLogID";
import { PromptID } from "../promptID";
import { ActionLog } from "../types/actionLog";
import { AttachmentID } from "../types/attachmentID";
import { Prompt } from "../types/prompt";
import { sha256Sync } from "./sha256Sync";
import { sha256 } from "./sha256";
import { Digest } from "multiformats/hashes/digest";

type EncodableWhitelist = Prompt | ActionLog;

function createCIDFromHash(hash: Digest, code: number): string {
  const cid = CID.create(1, code, hash);
  return cid.toString(base58btc);
}

export async function encodeObjectToCIDString<T extends EncodableWhitelist>(
  object: CIDEncodable<T>,
): Promise<string> {
  const encodedBuffer = dagJSON.encode(object);
  const hash = await sha256(encodedBuffer);
  return createCIDFromHash(hash, dagJSON.code);
}

export function encodeObjectToCIDStringSync<T extends EncodableWhitelist>(
  object: CIDEncodable<T>,
): string {
  const encodedBuffer = dagJSON.encode(object);
  const hash = sha256Sync(encodedBuffer);
  return createCIDFromHash(hash, dagJSON.code);
}

export async function encodeRawBufferToCIDString(
  buffer: Uint8Array,
): Promise<string> {
  const hash = await sha256(buffer);
  return createCIDFromHash(hash, raw.code);
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type CIDEncodable<T> = T extends PromptID | ActionLogID | AttachmentID
  ? CID
  : T extends object
  ? { [K in keyof T]: CIDEncodable<T[K]> }
  : T extends (infer P)[]
  ? CIDEncodable<P>[]
  : T;
