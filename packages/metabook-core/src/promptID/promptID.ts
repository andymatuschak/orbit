import DAGPB from "ipld-dag-pb";

import Proto from "../generated/proto";
import {
  applicationPromptType,
  basicPromptType,
  clozePromptType,
  Prompt,
  PromptField,
  QAPrompt,
} from "../types/prompt";
import { multicodec, encodeDAGNodeToCIDString } from "../util/cids";

function getProtobufRepresentationForQAPrompt(
  qaPrompt: QAPrompt,
): Proto.IQuestionAnswerPrompt {
  return {
    question: qaPrompt.question.contents,
    answer: qaPrompt.answer.contents,
    explanation: qaPrompt.explanation?.contents ?? null,
  };
}

function getProtobufRepresentationForPrompt(prompt: Prompt): Proto.IPrompt {
  switch (prompt.promptType) {
    case basicPromptType:
      return {
        basicPrompt: getProtobufRepresentationForQAPrompt(prompt),
      };
    case applicationPromptType:
      return {
        applicationPrompt: {
          variants: prompt.variants.map(getProtobufRepresentationForQAPrompt),
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

export async function getIDForPrompt(prompt: Prompt): Promise<PromptID> {
  // 1. Serialize the prompt into a protobuf.
  const promptDataEncoding = Proto.Prompt.encode(
    getProtobufRepresentationForPrompt(prompt),
  ).finish();
  const promptBuffer =
    promptDataEncoding instanceof Buffer
      ? promptDataEncoding
      : new Buffer(promptDataEncoding);

  // 2. Wrap that data in an IPLD MerkleDAG leaf node.
  const dagNode = new DAGPB.DAGNode(promptBuffer, getDAGLinksForPrompt(prompt));

  // 3. Encode it to a CID string.
  return (await encodeDAGNodeToCIDString(dagNode)) as PromptID;
}
