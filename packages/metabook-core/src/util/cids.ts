import DAGPB, { util as DAGPBUtil } from "ipld-dag-pb";

import { create } from "multiformats";
import base58 from "multiformats/bases/base58";
import sha2 from "multiformats/hashes/sha2";
import raw from "multiformats/codecs/raw";
import { PromptID } from "../promptID";

const dagpb = {
  encode: DAGPBUtil.serialize,
  decode: (buffer: Uint8Array) => DAGPBUtil.deserialize(Buffer.from(buffer)),
  code: 0x70,
  name: "dag-pb",
};

const { multihash, multibase, multicodec, CID } = create();
multihash.add(sha2);
multibase.add(base58);
multicodec.add(dagpb);

export async function encodeDAGNodeToCIDString(
  dagNode: DAGPB.DAGNode,
): Promise<string> {
  // 1. Serialize the MerkleDAG node to a protobuf.
  const nodeBuffer = multicodec.encode(dagNode, dagpb.name);

  // 2. Hash the protobuf and encode that as a CID
  const hash = await multihash.hash(nodeBuffer, "sha2-256");
  const cid = CID.create(1, dagpb.code, hash);

  // 3. Express the CID as a base58 string.
  return cid.toString("base58btc") as PromptID;
}

export async function encodeRawBufferToCIDString(
  buffer: Uint8Array,
): Promise<string> {
  const hash = await multihash.hash(buffer, "sha2-256");
  const cid = CID.create(1, raw.code, hash);

  // 3. Express the CID as a base58 string.
  return cid.toString("base58btc") as PromptID;
}

export { CID, multibase, multihash, dagpb };
