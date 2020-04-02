import "buffer";
import { Buffer } from "buffer";
import CID from "cids";
import DAGPB from "ipld-dag-pb";
import multihashing from "multihashing";
import { QAPromptSpec } from "..";

import {
  applicationPromptSpecType,
  basicPromptSpecType,
  clozePromptGroupSpecType,
  PromptSpec,
} from "..";
import Proto from "./generated/proto";

function getProtobufRepresentationForPromptSpec(
  promptSpec: PromptSpec,
): Proto.IPrompt {
  switch (promptSpec.promptSpecType) {
    case basicPromptSpecType:
      return {
        basicPrompt: {
          ...promptSpec,
        },
      };
    case applicationPromptSpecType:
      return {
        applicationPrompt: {
          variants: promptSpec.variants,
        },
      };
    case clozePromptGroupSpecType:
      return {
        clozePrompt: {
          contents: promptSpec.contents,
        },
      };
  }
}

function getDAGLinksForPromptSpec(promptSpec: PromptSpec): DAGPB.DAGLink[] {
  function getDAGLinksForQAPrompt(
    qaPromptSpec: QAPromptSpec,
    prefix: string,
  ): DAGPB.DAGLink[] {
    return qaPromptSpec.attachments.map(
      (attachmentReference, index) =>
        new DAGPB.DAGLink(
          `${prefix}/${index}/${attachmentReference.type}`,
          attachmentReference.byteLength,
          attachmentReference.id,
        ),
    );
  }

  switch (promptSpec.promptSpecType) {
    case basicPromptSpecType:
      return getDAGLinksForQAPrompt(promptSpec, "");
    case applicationPromptSpecType:
      const variantLinks = promptSpec.variants.map((variant, index) =>
        getDAGLinksForQAPrompt(variant, index.toString()),
      );
      return variantLinks.reduce((output, list) => output.concat(list), []);
    case clozePromptGroupSpecType:
      return [];
  }
}

export type PromptSpecID = string & { __promptSpecIDOpaqueType: never };

export function getIDForPromptSpec(promptSpec: PromptSpec): PromptSpecID {
  // 1. Serialize the prompt into a protobuf.
  const promptDataEncoding = Proto.Prompt.encode(
    getProtobufRepresentationForPromptSpec(promptSpec),
  ).finish();
  const promptBuffer =
    promptDataEncoding instanceof Buffer
      ? promptDataEncoding
      : new Buffer(promptDataEncoding);

  // 2. Wrap that data in an IPLD MerkleDAG leaf node.
  const dagNode = new DAGPB.DAGNode(
    promptBuffer,
    getDAGLinksForPromptSpec(promptSpec),
  );

  // 3. Serialize the MerkleDAG node to a protobuf.
  const nodeBuffer = dagNode.serialize();

  // 4. Hash the protobuf and encode that as a CID.
  const hash = multihashing(nodeBuffer, "sha2-256");
  const cid = new CID(1, "dag-pb", hash, "base58btc");

  return cid.toString() as PromptSpecID;
}
