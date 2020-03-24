import "buffer";
import { Buffer } from "buffer";
import CID from "cids";
import DAGPB from "ipld-dag-pb";
import multihashing from "multihashing";

import { PromptData } from "..";
import Proto from "./generated/proto";

function getProtoFromPromptData(promptData: PromptData): Proto.IPrompt {
  switch (promptData.cardType) {
    case "basic":
      return {
        basicPrompt: {
          ...promptData,
        },
      };
    case "applicationPrompt":
      return {
        applicationPrompt: {
          variants: promptData.prompts,
        },
      };
  }
}

export function getIDForPromptData(promptData: PromptData): string {
  // 1. Serialize the prompt into a protobuf.
  const promptDataEncoding = Proto.Prompt.encode(
    getProtoFromPromptData(promptData),
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

  return cid.toString();
}
