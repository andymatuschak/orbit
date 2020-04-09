import "buffer";
import { Buffer } from "buffer";
import CID from "cids";
import DAGPB from "ipld-dag-pb";
import multihashing from "multihashing";
import Proto from "./generated/proto";
import {
  applicationPromptType,
  basicPromptType,
  clozePromptType,
  PromptField,
  Prompt,
  QAPrompt,
} from "../types/prompt";

function getProtobufRepresentationForQAPrompt(
  qaPrompt: QAPrompt,
): Proto.IQuestionAnswerPrompt {
  return {
    question: qaPrompt.question.contents,
    answer: qaPrompt.answer.contents,
    explanation: qaPrompt.explanation?.contents ?? null,
  };
}

function getProtobufRepresentationForPrompt(
  prompt: Prompt,
): Proto.IPrompt {
  switch (prompt.promptType) {
    case basicPromptType:
      return {
        basicPrompt: getProtobufRepresentationForQAPrompt(prompt),
      };
    case applicationPromptType:
      return {
        applicationPrompt: {
          variants: prompt.variants.map(
            getProtobufRepresentationForQAPrompt,
          ),
        },
      };
    case clozePromptType:
      return {
        clozePrompt: {
          body: prompt.body.contents,
        },
      };
  }
}

function getDAGLinksForPrompt(prompt: Prompt): DAGPB.DAGLink[] {
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
    qaPrompt: QAPrompt,
    prefix: string,
  ): DAGPB.DAGLink[] {
    return [
      ...getDAGLinksForPromptField(qaPrompt.question, prefix + "/question"),
      ...getDAGLinksForPromptField(qaPrompt.answer, prefix + "/answer"),
      ...(qaPrompt.explanation
        ? getDAGLinksForPromptField(
            qaPrompt.explanation,
            prefix + "/explanation",
          )
        : []),
    ];
  }

  switch (prompt.promptType) {
    case basicPromptType:
      return getDAGLinksForQAPrompt(prompt, "");
    case applicationPromptType:
      const variantLinks = prompt.variants.map((variant, index) =>
        getDAGLinksForQAPrompt(variant, index.toString()),
      );
      return variantLinks.reduce((output, list) => output.concat(list), []);
    case clozePromptType:
      return getDAGLinksForPromptField(prompt.body, "");
  }
}

export type PromptID = string & { __promptIDOpaqueType: never };

export function getIDForPrompt(prompt: Prompt): PromptID {
  // 1. Serialize the prompt into a protobuf.
  const promptDataEncoding = Proto.Prompt.encode(
    getProtobufRepresentationForPrompt(prompt),
  ).finish();
  const promptBuffer =
    promptDataEncoding instanceof Buffer
      ? promptDataEncoding
      : new Buffer(promptDataEncoding);

  // 2. Wrap that data in an IPLD MerkleDAG leaf node.
  const dagNode = new DAGPB.DAGNode(
    promptBuffer,
    getDAGLinksForPrompt(prompt),
  );

  // 3. Serialize the MerkleDAG node to a protobuf.
  const nodeBuffer = dagNode.serialize();

  // 4. Hash the protobuf and encode that as a CID.
  const hash = multihashing(nodeBuffer, "sha2-256");
  const cid = new CID(1, "dag-pb", hash, "base58btc");

  return cid.toString() as PromptID;
}
