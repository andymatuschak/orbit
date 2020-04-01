import "buffer";
import { Buffer } from "buffer";
import CID from "cids";
import DAGPB from "ipld-dag-pb";
import multihashing from "multihashing";

import {
  applicationPromptSpecType,
  basicPromptSpecType,
  clozePromptGroupSpecType,
  PromptSpec,
} from "../types/promptSpec";
import Proto from "./generated/proto";

function getProtoFromPromptSpec(promptData: PromptSpec): Proto.IPrompt {
  switch (promptData.promptSpecType) {
    case basicPromptSpecType:
      return {
        basicPrompt: {
          ...promptData,
        },
      };
    case applicationPromptSpecType:
      return {
        applicationPrompt: {
          variants: promptData.variants,
        },
      };
    case clozePromptGroupSpecType:
      return {
        clozePrompt: {
          contents: promptData.contents,
        },
      };
  }
}

export type PromptSpecID = string & { __promptSpecIDOpaqueType: never };

export function getIDForPromptSpec(promptSpec: PromptSpec): PromptSpecID {
  // 1. Serialize the prompt into a protobuf.
  const promptDataEncoding = Proto.Prompt.encode(
    getProtoFromPromptSpec(promptSpec),
  ).finish();
  const promptBuffer =
    promptDataEncoding instanceof Buffer
      ? promptDataEncoding
      : new Buffer(promptDataEncoding);

  // 2. Wrap that data in an IPLD MerkleDAG leaf node.
  const dagNode = new DAGPB.DAGNode(promptBuffer);

  // 3. Serialize the MerkleDAG node to a protobuf.
  const nodeBuffer = dagNode.serialize();

  // 4. Hash the protobuf and encode that as a CID.
  const hash = multihashing(nodeBuffer, "sha2-256");
  const cid = new CID(1, "dag-pb", hash, "base58btc");

  return cid.toString() as PromptSpecID;
}
