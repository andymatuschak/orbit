import "buffer";
import { Buffer } from "buffer";
import CID from "cids";
import DAGPB from "ipld-dag-pb";
import multihashing from "multihashing";
import Proto from "./generated/proto";
import {
  applicationPromptSpecType,
  basicPromptSpecType,
  clozePromptGroupSpecType,
  PromptField,
  PromptSpec,
  QAPromptSpec,
} from "../types/promptSpec";

function getProtobufRepresentationForQAPromptSpec(
  qaPromptSpec: QAPromptSpec,
): Proto.IQuestionAnswerPrompt {
  return {
    question: qaPromptSpec.question.contents,
    answer: qaPromptSpec.answer.contents,
    explanation: qaPromptSpec.explanation?.contents ?? null,
  };
}

function getProtobufRepresentationForPromptSpec(
  promptSpec: PromptSpec,
): Proto.IPromptSpec {
  switch (promptSpec.promptSpecType) {
    case basicPromptSpecType:
      return {
        basicPrompt: getProtobufRepresentationForQAPromptSpec(promptSpec),
      };
    case applicationPromptSpecType:
      return {
        applicationPrompt: {
          variants: promptSpec.variants.map(
            getProtobufRepresentationForQAPromptSpec,
          ),
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
  function getDAGLinksForPromptField(
    promptField: PromptField,
    prefix: string,
  ): DAGPB.DAGLink[] {
    return promptField.attachments.map(
      (attachmentReference, index) =>
        new DAGPB.DAGLink(
          `${prefix}/${index}/${attachmentReference.type}`,
          attachmentReference.byteLength,
          attachmentReference.id,
        ),
    );
  }

  function getDAGLinksForQAPrompt(
    qaPromptSpec: QAPromptSpec,
    prefix: string,
  ): DAGPB.DAGLink[] {
    return [
      ...getDAGLinksForPromptField(qaPromptSpec.question, prefix + "/question"),
      ...getDAGLinksForPromptField(qaPromptSpec.answer, prefix + "/answer"),
      ...(qaPromptSpec.explanation
        ? getDAGLinksForPromptField(
            qaPromptSpec.explanation,
            prefix + "/explanation",
          )
        : []),
    ];
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
  const promptDataEncoding = Proto.PromptSpec.encode(
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
